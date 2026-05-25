import { describe, expect, it } from "vitest";
import type { CommitData, CommitErrorKind } from "../commitTypes";
import {
  canRetryCommitSearch,
  getResultMessage,
  isEmptyCommitSearchResult,
} from "./resultMessages";

function errorResult(errorKind?: CommitErrorKind, error?: string): CommitData {
  return { found: false, errorKind, error, commits: [] };
}

describe("getResultMessage", () => {
  it.each([
    ["rate_limit", "GitHub is asking us to slow down."],
    ["timeout", "GitHub took too long to respond."],
    ["unavailable", "GitHub search is temporarily unavailable."],
    ["validation", "GitHub could not validate that search."],
    ["empty", "No public commits found."],
  ] as const)("returns specific copy for %s errors", (errorKind, title) => {
    expect(getResultMessage(errorResult(errorKind)).title).toBe(title);
  });

  it("falls back to the result error text for unknown kinds", () => {
    const message = getResultMessage(errorResult("unknown", "Boom"));
    expect(message.title).toBe("We could not complete that search.");
    expect(message.description).toBe("Boom");
  });

  it("uses generic copy when no error text is present", () => {
    expect(getResultMessage(errorResult("unknown")).description).toBe(
      "GitHub commit search failed. Please try again.",
    );
  });
});

describe("canRetryCommitSearch", () => {
  it.each(["rate_limit", "timeout", "unavailable", "unknown"] as const)(
    "allows retry for %s",
    (errorKind) => {
      expect(canRetryCommitSearch(errorResult(errorKind))).toBe(true);
    },
  );

  it.each(["empty", "validation"] as const)("does not allow retry for %s", (errorKind) => {
    expect(canRetryCommitSearch(errorResult(errorKind))).toBe(false);
  });

  it("returns false when there is no result", () => {
    expect(canRetryCommitSearch(null)).toBe(false);
  });
});

describe("isEmptyCommitSearchResult", () => {
  it("is true only for empty results", () => {
    expect(isEmptyCommitSearchResult(errorResult("empty"))).toBe(true);
    expect(isEmptyCommitSearchResult(errorResult("timeout"))).toBe(false);
    expect(isEmptyCommitSearchResult(null)).toBe(false);
  });
});
