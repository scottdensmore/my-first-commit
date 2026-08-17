/**
 * Deterministic fixtures for the browser suite, and nothing else.
 *
 * Lifted out of `app/_lib/actions.ts`, where they were 173 of 569 lines: thirty percent of the
 * `"use server"` module that queries GitHub with the token was test doubles, including one fixture
 * that throws on purpose and two that mutate process state between calls. Separating them leaves
 * that file as the production search path, lets coverage measure it honestly, and stops the
 * scaffolding shipping inside the module that matters most.
 *
 * Reached only when `E2E_COMMIT_SEARCH_MOCKS=1`, which `commitSearchMocksEnabled` decides for both
 * this module and `app/api/e2e-readiness/route.ts` -- the preflight that tells Playwright whether a
 * server it did not start will serve fixtures at all.
 *
 * No unit tests, deliberately. Every case here exists to be exercised through a browser, and the
 * Playwright suite is the regression test: a fixture that stops resolving fails the journey that
 * depends on it. That is also why this module is excluded from coverage, on the same footing as the
 * other files the gate covers by running rather than importing.
 *
 * The reserved usernames are documented in the E2E mocks gotcha in AGENTS.md. Add a case here and
 * add it there.
 */

import {
  EMPTY_COMMIT_SEARCH_MESSAGE,
  INCOMPLETE_COMMIT_SEARCH_MESSAGE,
  commitSearchError,
} from "./commitTypes";
import type { CommitData, CommitInfo } from "./commitTypes";
import { commitSearchMocksEnabled } from "./e2eCommitSearchMocks";
import { githubProfileUrl } from "./githubUrls";

const E2E_COMMIT_SEARCH_MOCKS_ENABLED = commitSearchMocksEnabled();

/** How long `e2e-slow-result` stalls, so a test can observe the pending state before it settles. */
export const E2E_SLOW_SEARCH_DELAY_MS = 750;

const E2E_REJECT_ONCE_USERNAME_PREFIX = "e2e-reject-once-";
const E2E_INCOMPLETE_ONCE_USERNAME_PREFIX = "e2e-incomplete-once-";
const E2E_INCOMPLETE_THEN_ERROR_USERNAME_PREFIX = "e2e-incomplete-then-error-";

// Per process, which is the point: a test can prove a retry re-issued the search rather than
// re-rendered the previous answer. Each such test uses a unique username, keyed on the Playwright
// worker index, so two tests cannot consume each other's first attempt.
const e2eRejectedUsernames = new Set<string>();
const e2eServedPartialUsernames = new Set<string>();

/**
 * Whether this search should fail as an unhandled Server Action rejection.
 *
 * Separate from the fixture results below because it cannot return one: the point is to throw, so
 * the client exercises the path where a Server Action rejects rather than resolves. Marks the
 * username as spent, so the retry that follows succeeds.
 */
export function shouldRejectCommitSearchOnce(username: string) {
  if (!E2E_COMMIT_SEARCH_MOCKS_ENABLED) return false;
  if (!username.startsWith(E2E_REJECT_ONCE_USERNAME_PREFIX)) return false;
  if (e2eRejectedUsernames.has(username)) return false;

  e2eRejectedUsernames.add(username);

  return true;
}

export function getE2eCommitSearchResult(username: string): CommitData | null {
  if (!E2E_COMMIT_SEARCH_MOCKS_ENABLED) return null;

  // Keep browser tests deterministic without coupling them to GitHub search availability.
  const mockCommit: CommitInfo = {
    message: "Initial public commit\n\nAdd the first project files",
    date: "2020-01-02T03:04:05Z",
    html_url: "https://github.com/e2e-user/origin-repo/commit/abcdef123456",
    sha: "abcdef123456",
    repository: {
      name: "origin-repo",
      owner: "e2e-user",
      full_name: "e2e-user/origin-repo",
    },
    author: {
      login: username,
      avatar_url: "https://github.com/ghost.png",
      html_url: githubProfileUrl(username),
    },
  };

  const completeResult = (): CommitData => ({
    found: true,
    commits: [
      mockCommit,
      {
        ...mockCommit,
        message: "Follow-up commit",
        html_url: "https://github.com/e2e-user/next-repo/commit/bcdefa234567",
        sha: "bcdefa234567",
        repository: {
          name: "next-repo",
          owner: "e2e-user",
          full_name: "e2e-user/next-repo",
        },
      },
    ],
  });

  if (
    username === "e2e-result" ||
    username === "e2e-slow-result" ||
    username.startsWith(E2E_REJECT_ONCE_USERNAME_PREFIX)
  ) {
    return completeResult();
  }

  // Every field at a length or shape that has nowhere to wrap: a repository name with no spaces,
  // a subject that is one unbroken token, a body carrying a long URL, and a 39-character owner.
  // The other fixtures are all short, so they render identically whether or not the card handles
  // long content -- which is why the overflow this reproduces went unnoticed.
  if (username === "e2e-long-data") {
    const owner = "a".repeat(39);
    const repositoryName = "supercalifragilisticexpialidocious-monorepo-services-platform";

    return {
      found: true,
      commits: [
        {
          ...mockCommit,
          message: [
            "Refactorthecommitindexingpipelineandnormalizeeverydownstreamconsumer",
            "",
            "See https://github.com/" +
              owner +
              "/" +
              repositoryName +
              "/pull/12345#issuecomment-9876543210",
          ].join("\n"),
          repository: {
            name: repositoryName,
            owner,
            full_name: owner + "/" + repositoryName,
          },
          author: { ...mockCommit.author, login: owner },
        },
        {
          ...mockCommit,
          message: "Follow-up with an unbroken subject line that keeps going and going and going",
          html_url: "https://github.com/e2e-user/next-repo/commit/bcdefa234567",
          sha: "bcdefa234567",
          repository: {
            name: repositoryName,
            owner,
            full_name: owner + "/" + repositoryName,
          },
          author: { ...mockCommit.author, login: owner },
        },
      ],
    };
  }

  if (username === "e2e-incomplete") {
    return {
      found: true,
      incomplete: true,
      commits: [mockCommit],
    };
  }

  // Stateful, so a browser test can prove a retry re-issues the search rather than
  // re-rendering the same state: partial first, then the outcome the prefix names.
  if (
    username.startsWith(E2E_INCOMPLETE_ONCE_USERNAME_PREFIX) ||
    username.startsWith(E2E_INCOMPLETE_THEN_ERROR_USERNAME_PREFIX)
  ) {
    if (!e2eServedPartialUsernames.has(username)) {
      e2eServedPartialUsernames.add(username);
      return {
        found: true,
        incomplete: true,
        commits: [mockCommit],
      };
    }

    if (username.startsWith(E2E_INCOMPLETE_THEN_ERROR_USERNAME_PREFIX)) {
      return commitSearchError(
        "GitHub rate limit reached. Please try again in a few minutes.",
        "rate_limit",
      );
    }

    return completeResult();
  }

  if (username === "e2e-malformed-dates") {
    return {
      found: true,
      commits: [
        mockCommit,
        {
          ...mockCommit,
          message: "Commit with malformed date",
          date: "not-a-date",
          html_url: "https://github.com/e2e-user/next-repo/commit/bcdefa234567",
          sha: "bcdefa234567",
          repository: {
            name: "next-repo",
            owner: "e2e-user",
            full_name: "e2e-user/next-repo",
          },
        },
      ],
    };
  }

  switch (username) {
    case "e2e-empty":
      return commitSearchError(EMPTY_COMMIT_SEARCH_MESSAGE, "empty");
    case "e2e-incomplete-empty":
      return commitSearchError(INCOMPLETE_COMMIT_SEARCH_MESSAGE, "empty", true);
    case "e2e-rate-limit":
      return commitSearchError(
        "GitHub rate limit reached. Please try again in a few minutes.",
        "rate_limit",
      );
    case "e2e-unavailable":
      return commitSearchError(
        "GitHub is temporarily unavailable. Please try again soon.",
        "unavailable",
      );
    case "e2e-timeout":
      return commitSearchError("GitHub took too long to respond. Please try again.", "timeout");
    case "e2e-unknown":
      return commitSearchError("GitHub commit search failed. Please try again.", "unknown");
    // GitHub rejecting the search itself, which the client's own username validation cannot
    // produce -- the handle is well-formed, and the refusal comes back from the search.
    case "e2e-validation":
      return commitSearchError("GitHub rejected that search.", "validation");
    default:
      return null;
  }
}
