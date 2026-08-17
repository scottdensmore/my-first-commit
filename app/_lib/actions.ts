"use server";

import { Octokit } from "octokit";
import {
  EMPTY_COMMIT_SEARCH_MESSAGE,
  INCOMPLETE_COMMIT_SEARCH_MESSAGE,
  commitSearchError,
  toCommitSearchSuccess,
} from "./commitTypes";
import type { CommitData, CommitErrorKind, CommitInfo } from "./commitTypes";
import {
  E2E_SLOW_SEARCH_DELAY_MS,
  getE2eCommitSearchResult,
  shouldRejectCommitSearchOnce,
} from "./e2eCommitSearchFixtures";
import { getCachedCommitSearch, setCachedCommitSearch } from "./commitSearchCache";
import { coalesceCommitSearch } from "./commitSearchInFlight";
import {
  COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES,
  COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS,
  allowCommitSearch,
} from "./commitSearchRateLimit";
import { githubProfileUrl } from "./githubUrls";
import { logger } from "./logger";
import { getSearchClientKey } from "./searchClientKey";
import { getUsernameValidationMessage, normalizeGitHubUsername } from "./username";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

const GITHUB_SEARCH_TIMEOUT_MS = 10_000;

type GitHubErrorDetails = {
  message?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: number;
  status?: unknown;
};

function parseNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  }

  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined;

  const parsedValue = Number(value);
  return Number.isSafeInteger(parsedValue) ? parsedValue : undefined;
}

function getGitHubErrorDetails(error: unknown): GitHubErrorDetails {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const status = "status" in error ? error.status : undefined;
  const message =
    "message" in error && typeof error.message === "string" ? error.message : undefined;
  const headers =
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "headers" in error.response &&
    typeof error.response.headers === "object" &&
    error.response.headers !== null
      ? (error.response.headers as Record<string, unknown>)
      : undefined;

  return {
    message,
    rateLimitRemaining: parseNonNegativeInteger(headers?.["x-ratelimit-remaining"]),
    rateLimitReset: parseNonNegativeInteger(headers?.["x-ratelimit-reset"]),
    status,
  };
}

function isGitHubRateLimitError(errorDetails: GitHubErrorDetails) {
  if (errorDetails.status === 429) return true;
  if (errorDetails.rateLimitRemaining === 0) return true;

  return (
    errorDetails.status === 403 && /rate limit|too many requests/i.test(errorDetails.message ?? "")
  );
}

function isTimeoutError(error: unknown, errorDetails: GitHubErrorDetails) {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  ) {
    return true;
  }

  return /aborted|timeout|timed out/i.test(errorDetails.message ?? "");
}

function isGitHubUnavailableError(errorDetails: GitHubErrorDetails) {
  return (
    typeof errorDetails.status === "number" &&
    errorDetails.status >= 500 &&
    errorDetails.status < 600
  );
}

function withTimeoutSignal<T>(callback: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_SEARCH_TIMEOUT_MS);

  return Promise.resolve()
    .then(() => callback(controller.signal))
    .finally(() => clearTimeout(timeout));
}

function parseableDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function mapCommitItem(item: unknown, username: string): CommitInfo | null {
  if (typeof item !== "object" || item === null) return null;

  const candidate = item as {
    commit?: {
      message?: unknown;
      author?: { date?: unknown } | null;
      committer?: { date?: unknown } | null;
    };
    html_url?: unknown;
    sha?: unknown;
    repository?: {
      name?: unknown;
      full_name?: unknown;
      owner?: { login?: unknown } | null;
    };
    author?: {
      login?: unknown;
      avatar_url?: unknown;
      html_url?: unknown;
    } | null;
  };
  const message = candidate.commit?.message;
  const htmlUrl = candidate.html_url;
  const sha = candidate.sha;
  const repositoryName = candidate.repository?.name;
  const repositoryFullName = candidate.repository?.full_name;
  const repositoryOwner = candidate.repository?.owner?.login;

  if (
    typeof message !== "string" ||
    typeof htmlUrl !== "string" ||
    !htmlUrl ||
    typeof sha !== "string" ||
    !sha ||
    typeof repositoryName !== "string" ||
    typeof repositoryFullName !== "string" ||
    typeof repositoryOwner !== "string"
  ) {
    return null;
  }

  const authorDate = candidate.commit?.author?.date;
  const committerDate = candidate.commit?.committer?.date;
  const date = parseableDate(committerDate) ?? parseableDate(authorDate);
  const authorLogin = candidate.author?.login;
  const authorAvatarUrl = candidate.author?.avatar_url;
  const authorHtmlUrl = candidate.author?.html_url;

  if (!date) return null;

  return {
    message,
    date,
    html_url: htmlUrl,
    sha,
    repository: {
      name: repositoryName,
      owner: repositoryOwner,
      full_name: repositoryFullName,
    },
    author: {
      login: typeof authorLogin === "string" ? authorLogin : username,
      avatar_url:
        typeof authorAvatarUrl === "string" ? authorAvatarUrl : "https://github.com/ghost.png",
      html_url: typeof authorHtmlUrl === "string" ? authorHtmlUrl : githubProfileUrl(username),
    },
  };
}

export async function getCommits(username: string): Promise<CommitData> {
  const runtimeInput: unknown = username;
  if (typeof runtimeInput !== "string") {
    return commitSearchError("Username is required", "validation");
  }

  const normalizedUsername = normalizeGitHubUsername(runtimeInput);
  if (!normalizedUsername) return commitSearchError("Username is required", "validation");

  const validationMessage = getUsernameValidationMessage(normalizedUsername);
  if (validationMessage) return commitSearchError(validationMessage, "validation");

  if (shouldRejectCommitSearchOnce(normalizedUsername)) {
    throw new Error("Synthetic E2E Server Action rejection");
  }

  const e2eCommitSearchResult = getE2eCommitSearchResult(normalizedUsername);
  if (e2eCommitSearchResult) {
    if (normalizedUsername === "e2e-slow-result") {
      await new Promise((resolve) => setTimeout(resolve, E2E_SLOW_SEARCH_DELAY_MS));
    }
    return e2eCommitSearchResult;
  }

  const cacheKey = normalizedUsername.toLowerCase();
  const cachedCommitSearch = getCachedCommitSearch(cacheKey);
  if (cachedCommitSearch) return cachedCommitSearch;

  // Only searches that can still reach GitHub are counted, so an answer the cache already
  // holds costs a visitor nothing. A flood of distinct usernames is all misses, which is
  // exactly the traffic this bounds. The result is the ordinary rate-limit one: the visitor is
  // being asked to slow down either way, and the screen that says so already offers a retry.
  const clientKey = await getSearchClientKey();
  if (clientKey && !allowCommitSearch(clientKey)) {
    logger.warn({
      event: "commit_search_rate_limited_client",
      fields: {
        errorKind: "rate_limit",
        limit: COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES,
        windowMs: COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS,
      },
    });
    // Not shown to anyone: the rate-limit screen's copy comes from the error kind, so this
    // stays accurate about which limit was reached rather than blaming GitHub for ours.
    return commitSearchError(
      "Too many searches at once. Please wait a moment and try again.",
      "rate_limit",
    );
  }

  // The cache only helps after a search finishes; concurrent misses for the same username
  // would each call GitHub against one shared quota.
  return coalesceCommitSearch(cacheKey, () => searchGitHubCommits(normalizedUsername, cacheKey));
}

async function searchGitHubCommits(
  normalizedUsername: string,
  cacheKey: string,
): Promise<CommitData> {
  try {
    const response = await withTimeoutSignal((signal) =>
      octokit.rest.search.commits({
        q: `author:${normalizedUsername}`,
        sort: "committer-date",
        order: "asc",
        per_page: 10,
        request: {
          signal,
        },
      }),
    );

    const items = response.data.items;
    // GitHub abandons a commit search that runs too long and still returns 200 with
    // whatever it had indexed so far. Treating that as authoritative would claim a
    // "first" commit that may not be the earliest one, so it stays flagged and
    // uncached; setCachedCommitSearch drops incomplete results.
    const isIncompleteSearch = response.data.incomplete_results === true;

    if (isIncompleteSearch) {
      logger.warn({
        event: "github_commit_search_incomplete",
        fields: {
          itemCount: items?.length ?? 0,
        },
      });
    }

    if (!items || items.length === 0) {
      const emptyResult = commitSearchError(
        isIncompleteSearch ? INCOMPLETE_COMMIT_SEARCH_MESSAGE : EMPTY_COMMIT_SEARCH_MESSAGE,
        "empty",
        isIncompleteSearch,
      );
      setCachedCommitSearch(cacheKey, emptyResult);
      return emptyResult;
    }

    const commits = items.flatMap((item, itemIndex) => {
      const commit = mapCommitItem(item, normalizedUsername);
      if (commit) return [commit];

      logger.warn({
        event: "github_commit_search_malformed_item",
        fields: {
          itemIndex,
        },
      });
      return [];
    });

    // One call establishes the non-empty invariant and builds the result, so the check and the
    // construction cannot drift apart the way a separate `length === 0` guard could.
    const result = toCommitSearchSuccess(commits, { incomplete: isIncompleteSearch });

    if (!result) {
      const emptyResult = commitSearchError(
        isIncompleteSearch ? INCOMPLETE_COMMIT_SEARCH_MESSAGE : EMPTY_COMMIT_SEARCH_MESSAGE,
        "empty",
        isIncompleteSearch,
      );
      setCachedCommitSearch(cacheKey, emptyResult);
      return emptyResult;
    }

    setCachedCommitSearch(cacheKey, result);
    return result;
  } catch (error: unknown) {
    const errorDetails = getGitHubErrorDetails(error);
    const { status } = errorDetails;

    if (isTimeoutError(error, errorDetails)) {
      logger.warn({
        event: "github_commit_search_timeout",
        fields: {
          status: typeof status === "number" ? status : undefined,
          errorKind: "timeout",
        },
      });
      return commitSearchError("GitHub took too long to respond. Please try again.", "timeout");
    }

    if (isGitHubRateLimitError(errorDetails)) {
      logger.warn({
        event: "github_commit_search_rate_limited",
        fields: {
          status: typeof status === "number" ? status : undefined,
          errorKind: "rate_limit",
          rateLimitRemaining: errorDetails.rateLimitRemaining,
          rateLimitReset: errorDetails.rateLimitReset,
        },
      });
      return commitSearchError(
        "GitHub rate limit reached. Please try again in a few minutes.",
        "rate_limit",
      );
    }

    if (isGitHubUnavailableError(errorDetails)) {
      logger.error({
        event: "github_commit_search_unavailable",
        fields: {
          status: typeof status === "number" ? status : undefined,
          errorKind: "unavailable",
        },
      });
      return commitSearchError(
        "GitHub is temporarily unavailable. Please try again soon.",
        "unavailable",
      );
    }

    const errorKind: CommitErrorKind = status === 422 ? "validation" : "unknown";
    logger.error({
      event: "github_commit_search_failed",
      fields: {
        status: typeof status === "number" ? status : undefined,
        errorKind,
      },
    });

    if (status === 422) {
      return commitSearchError("Validation failed. User might not exist.", "validation");
    }

    return commitSearchError("Failed to fetch commits.", "unknown");
  }
}
