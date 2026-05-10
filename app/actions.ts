'use server'

import { Octokit } from "octokit";
import { logger } from "./logger";

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN 
});

const GITHUB_SEARCH_TIMEOUT_MS = 10_000;

type GitHubErrorDetails = {
  message?: string;
  rateLimitRemaining?: string;
  rateLimitReset?: string;
  status?: unknown;
};

export interface CommitInfo {
    message: string;
    date: string;
    html_url: string;
    sha: string;
    repository: {
      name: string;
      owner: string;
      full_name: string;
    };
    author: {
      login: string;
      avatar_url: string;
      html_url: string;
    };
}

export interface CommitData {
  found: boolean;
  error?: string;
  errorKind?: "empty" | "rate_limit" | "timeout" | "unavailable" | "validation" | "unknown";
  commits: CommitInfo[];
}

function getGitHubErrorDetails(error: unknown): GitHubErrorDetails {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const status = "status" in error ? error.status : undefined;
  const message = "message" in error && typeof error.message === "string"
    ? error.message
    : undefined;
  const headers = "response" in error
    && typeof error.response === "object"
    && error.response !== null
    && "headers" in error.response
    && typeof error.response.headers === "object"
    && error.response.headers !== null
      ? error.response.headers as Record<string, string | undefined>
      : undefined;

  return {
    message,
    rateLimitRemaining: headers?.["x-ratelimit-remaining"],
    rateLimitReset: headers?.["x-ratelimit-reset"],
    status,
  };
}

function isGitHubRateLimitError(errorDetails: GitHubErrorDetails) {
  if (errorDetails.status === 429) return true;
  if (errorDetails.rateLimitRemaining === "0") return true;

  return errorDetails.status === 403
    && /rate limit|too many requests/i.test(errorDetails.message ?? "");
}

function isTimeoutError(error: unknown, errorDetails: GitHubErrorDetails) {
  if (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError") {
    return true;
  }

  return /aborted|timeout|timed out/i.test(errorDetails.message ?? "");
}

function isGitHubUnavailableError(errorDetails: GitHubErrorDetails) {
  return typeof errorDetails.status === "number"
    && errorDetails.status >= 500
    && errorDetails.status < 600;
}

function withTimeoutSignal<T>(callback: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_SEARCH_TIMEOUT_MS);

  return Promise.resolve()
    .then(() => callback(controller.signal))
    .finally(() => clearTimeout(timeout));
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
    typeof message !== "string"
    || typeof htmlUrl !== "string"
    || !htmlUrl
    || typeof sha !== "string"
    || !sha
    || typeof repositoryName !== "string"
    || typeof repositoryFullName !== "string"
    || typeof repositoryOwner !== "string"
  ) {
    return null;
  }

  const authorDate = candidate.commit?.author?.date;
  const committerDate = candidate.commit?.committer?.date;
  const authorLogin = candidate.author?.login;
  const authorAvatarUrl = candidate.author?.avatar_url;
  const authorHtmlUrl = candidate.author?.html_url;

  return {
    message,
    date: typeof authorDate === "string"
      ? authorDate
      : typeof committerDate === "string"
        ? committerDate
        : "",
    html_url: htmlUrl,
    sha,
    repository: {
      name: repositoryName,
      owner: repositoryOwner,
      full_name: repositoryFullName,
    },
    author: {
      login: typeof authorLogin === "string" ? authorLogin : username,
      avatar_url: typeof authorAvatarUrl === "string" ? authorAvatarUrl : "https://github.com/ghost.png",
      html_url: typeof authorHtmlUrl === "string" ? authorHtmlUrl : `https://github.com/${username}`,
    },
  };
}

export async function getCommits(username: string): Promise<CommitData> {
  if (!username) return { found: false, error: "Username is required", errorKind: "validation", commits: [] };

  try {
    const response = await withTimeoutSignal((signal) => octokit.rest.search.commits({
      q: `author:${username}`,
      sort: 'committer-date',
      order: 'asc',
      per_page: 10,
      request: {
        signal,
      },
    }));

    const items = response.data.items;

    if (!items || items.length === 0) {
      return {
        found: false,
        error: "No public commits found for this user (or indexing is delayed).",
        errorKind: "empty",
        commits: [],
      };
    }

    const commits = items.flatMap((item, itemIndex) => {
      const commit = mapCommitItem(item, username);
      if (commit) return [commit];

      logger.warn({
        event: "github_commit_search_malformed_item",
        fields: {
          itemIndex,
        },
      });
      return [];
    });

    if (commits.length === 0) {
      return {
        found: false,
        error: "No public commits found for this user (or indexing is delayed).",
        errorKind: "empty",
        commits: [],
      };
    }

    return {
      found: true,
      commits: commits
    };

  } catch (error: unknown) {
    let errorMessage = "Failed to fetch commits.";
    const errorDetails = getGitHubErrorDetails(error);
    const { status } = errorDetails;

    if (isTimeoutError(error, errorDetails)) {
      logger.warn({
        event: "github_commit_search_timeout",
        fields: {
          status: typeof status === "number" ? status : undefined,
          message: errorDetails.message,
        },
      });
      errorMessage = "GitHub took too long to respond. Please try again.";
      return { found: false, error: errorMessage, errorKind: "timeout", commits: [] };
    }

    if (isGitHubRateLimitError(errorDetails)) {
      logger.warn({
        event: "github_commit_search_rate_limited",
        fields: {
          status: typeof status === "number" ? status : undefined,
          message: errorDetails.message,
          rateLimitRemaining: errorDetails.rateLimitRemaining,
          rateLimitReset: errorDetails.rateLimitReset,
        },
      });
      errorMessage = "GitHub rate limit reached. Please try again in a few minutes.";
      return { found: false, error: errorMessage, errorKind: "rate_limit", commits: [] };
    }

    if (isGitHubUnavailableError(errorDetails)) {
      logger.error({
        event: "github_commit_search_unavailable",
        fields: {
          status: typeof status === "number" ? status : undefined,
          message: errorDetails.message,
        },
      }, error);
      errorMessage = "GitHub is temporarily unavailable. Please try again soon.";
      return { found: false, error: errorMessage, errorKind: "unavailable", commits: [] };
    }

    {
      logger.error({
        event: "github_commit_search_failed",
        fields: {
          status: typeof status === "number" ? status : undefined,
          message: errorDetails.message,
        },
      }, error);
    }

    if (status === 422) {
      errorMessage = "Validation failed. User might not exist.";
      return { found: false, error: errorMessage, errorKind: "validation", commits: [] };
    }
    
    return { found: false, error: errorMessage, errorKind: "unknown", commits: [] };
  }
}
