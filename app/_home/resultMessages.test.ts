import { describe, expect, it } from "vitest";
import type { CommitData, CommitErrorKind } from "../_lib/commitTypes";
import {
  canRetryCommitSearch,
  getResultMessage,
  getRetryFailureMessage,
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

  it("does not report an incomplete empty search as an absence of commits", () => {
    const message = getResultMessage({ ...errorResult("empty"), incomplete: true });

    expect(message.title).not.toBe("No public commits found.");
    expect(message.title).toBe("GitHub could not finish this search.");
    expect(message.description).toMatch(/try again/i);
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

describe("getRetryFailureMessage", () => {
  it.each([
    [
      "rate_limit",
      "GitHub is rate limiting searches right now, so wait a few minutes before searching again.",
    ],
    ["timeout", "GitHub took too long to respond again, so give it a moment before retrying."],
    ["unavailable", "GitHub search is still unavailable."],
  ] as const)("returns a single clause for %s", (errorKind, message) => {
    expect(getRetryFailureMessage(errorResult(errorKind))).toBe(message);
  });

  it("keeps recovery guidance, since the retry button stays live beside the message", () => {
    // Pressing the button again during a rate limit is guaranteed to fail and deepens it.
    expect(getRetryFailureMessage(errorResult("rate_limit"))).toMatch(/wait a few minutes/i);
  });

  it("does not reuse the panel copy, which is written as standalone multi-sentence prose", () => {
    const panelDescription = getResultMessage(errorResult("rate_limit")).description;

    expect(getRetryFailureMessage(errorResult("rate_limit"))).not.toBe(panelDescription);
    expect(getRetryFailureMessage(errorResult("rate_limit"))).not.toMatch(/\.\s/);
  });

  it("does not claim nothing came back when commits are still on screen", () => {
    // An incomplete-empty retry reports "nothing came back yet" in the panel copy, which
    // would contradict the commits rendered directly below this message.
    const message = getRetryFailureMessage({ ...errorResult("empty"), incomplete: true });

    expect(message).not.toMatch(/nothing came back/i);
    expect(message).toMatch(/finish/i);
  });

  it("falls back to a generic clause for unknown kinds", () => {
    expect(getRetryFailureMessage(errorResult("unknown"))).toBe("That search did not finish.");
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

  it("allows retry for an incomplete empty search, which is unfinished rather than answered", () => {
    expect(canRetryCommitSearch({ ...errorResult("empty"), incomplete: true })).toBe(true);
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
