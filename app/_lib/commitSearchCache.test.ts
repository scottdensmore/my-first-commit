import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitData, CommitErrorKind } from "./commitTypes";
import {
  clearCommitSearchCache,
  getCachedCommitSearch,
  setCachedCommitSearch,
} from "./commitSearchCache";

// A factory, not a shared const. A test that mutates a cached result must not be able to reach
// the value it then compares against, or a broken copy moves both sides of the comparison
// together and the assertion cannot fail.
function makeCommitSearchResult(): CommitData {
  return {
    found: true,
    commits: [
      {
        message: "Initial commit",
        date: "2024-01-02T00:00:00Z",
        html_url: "https://github.com/octo/repo/commit/abcdef123456",
        sha: "abcdef123456",
        repository: {
          name: "repo",
          owner: "octo",
          full_name: "octo/repo",
        },
        author: {
          login: "octo",
          avatar_url: "https://github.com/octo.png",
          html_url: "https://github.com/octo",
        },
      },
    ],
  };
}

/** The shape of the empty state the server action caches for a user with no public commits. */
function makeEmptyResult(): CommitData {
  return {
    found: false,
    error: "No public commits found for this user (or indexing is delayed).",
    errorKind: "empty",
    commits: [],
  };
}

// Spelled out rather than imported from the module under test. The five-minute lifetime is the
// contract callers and the runbook rely on, so a test that read the constant back would move with
// a change to it and report nothing.
const CACHE_TTL_MS = 5 * 60 * 1000;

describe("commit search cache", () => {
  beforeEach(() => {
    clearCommitSearchCache();
  });

  it("returns copies so callers cannot mutate cached results", () => {
    setCachedCommitSearch("octo", makeCommitSearchResult(), 1_000);

    const cachedResult = getCachedCommitSearch("octo", 1_100);
    cachedResult?.commits.push({
      ...makeCommitSearchResult().commits[0]!,
      sha: "mutated",
    });
    if (cachedResult?.commits[0]) {
      cachedResult.commits[0].repository.name = "mutated";
    }

    expect(getCachedCommitSearch("octo", 1_200)).toEqual(makeCommitSearchResult());
  });

  it("copies on the way in, so mutating the stored value cannot reach the cache", () => {
    const storedResult = makeCommitSearchResult();
    setCachedCommitSearch("octo", storedResult, 1_000);

    storedResult.commits[0]!.repository.name = "mutated";

    expect(getCachedCommitSearch("octo", 1_100)).toEqual(makeCommitSearchResult());
  });

  it("never stores an incomplete result", () => {
    setCachedCommitSearch("octo", { ...makeCommitSearchResult(), incomplete: true }, 1_000);

    expect(getCachedCommitSearch("octo", 1_100)).toBeNull();
  });

  it("does not let an incomplete result evict a cached complete result", () => {
    setCachedCommitSearch("octo", makeCommitSearchResult(), 1_000);
    setCachedCommitSearch("octo", { ...makeCommitSearchResult(), incomplete: true }, 1_100);

    expect(getCachedCommitSearch("octo", 1_200)).toEqual(makeCommitSearchResult());
  });

  it("caps the number of cached entries", () => {
    for (let index = 0; index < 101; index += 1) {
      setCachedCommitSearch(`octo-${index}`, makeCommitSearchResult(), 1_000);
    }

    expect(getCachedCommitSearch("octo-0", 1_100)).toBeNull();
    expect(getCachedCommitSearch("octo-100", 1_100)).toEqual(makeCommitSearchResult());
  });

  it("refreshes recently read entries before pruning the oldest entries", () => {
    for (let index = 0; index < 100; index += 1) {
      setCachedCommitSearch(`octo-${index}`, makeCommitSearchResult(), 1_000);
    }

    getCachedCommitSearch("octo-0", 1_100);
    setCachedCommitSearch("octo-100", makeCommitSearchResult(), 1_200);

    expect(getCachedCommitSearch("octo-0", 1_300)).toEqual(makeCommitSearchResult());
    expect(getCachedCommitSearch("octo-1", 1_300)).toBeNull();
  });

  // These run on a fake clock and call the cache without the `now` argument, so they exercise the
  // `Date.now()` default the server action actually uses. Passing timestamps in, as the tests
  // above do, proves the comparison but never that the default reads the clock at all.
  describe("five-minute expiry", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-02T03:04:05.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("serves an entry one millisecond before the deadline", () => {
      setCachedCommitSearch("octo", makeCommitSearchResult());

      vi.advanceTimersByTime(CACHE_TTL_MS - 1);

      expect(getCachedCommitSearch("octo")).toEqual(makeCommitSearchResult());
    });

    it("drops an entry once the deadline is reached", () => {
      setCachedCommitSearch("octo", makeCommitSearchResult());

      vi.advanceTimersByTime(CACHE_TTL_MS);

      expect(getCachedCommitSearch("octo")).toBeNull();
    });

    it("does not extend the deadline when an entry is read inside it", () => {
      setCachedCommitSearch("octo", makeCommitSearchResult());

      // A read refreshes eviction order, which must not also refresh the lifetime: a popular
      // username would otherwise be served from a cache entry that never expires.
      vi.advanceTimersByTime(CACHE_TTL_MS - 1);
      expect(getCachedCommitSearch("octo")).toEqual(makeCommitSearchResult());

      vi.advanceTimersByTime(1);
      expect(getCachedCommitSearch("octo")).toBeNull();
    });

    it("starts a fresh deadline when an entry is written again", () => {
      setCachedCommitSearch("octo", makeCommitSearchResult());

      vi.advanceTimersByTime(CACHE_TTL_MS - 1);
      setCachedCommitSearch("octo", makeCommitSearchResult());

      vi.advanceTimersByTime(CACHE_TTL_MS - 1);
      expect(getCachedCommitSearch("octo")).toEqual(makeCommitSearchResult());
    });

    it("keeps an expired entry gone when a later search is cached", () => {
      setCachedCommitSearch("octo", makeCommitSearchResult());

      vi.advanceTimersByTime(CACHE_TTL_MS);
      setCachedCommitSearch("hubot", makeCommitSearchResult());

      expect(getCachedCommitSearch("octo")).toBeNull();
      expect(getCachedCommitSearch("hubot")).toEqual(makeCommitSearchResult());
    });
  });

  describe("which results are cacheable", () => {
    it("caches an empty result, so a user with no commits is not searched again", () => {
      setCachedCommitSearch("ghost", makeEmptyResult(), 1_000);

      expect(getCachedCommitSearch("ghost", 1_100)).toEqual(makeEmptyResult());
    });

    it("expires an empty result on the same five-minute deadline", () => {
      setCachedCommitSearch("ghost", makeEmptyResult(), 1_000);

      expect(getCachedCommitSearch("ghost", 1_000 + CACHE_TTL_MS - 1)).toEqual(makeEmptyResult());
      expect(getCachedCommitSearch("ghost", 1_000 + CACHE_TTL_MS)).toBeNull();
    });

    it("returns a copy of an empty result rather than the stored value", () => {
      const storedResult = makeEmptyResult();
      setCachedCommitSearch("ghost", storedResult, 1_000);

      storedResult.error = "mutated";

      expect(getCachedCommitSearch("ghost", 1_100)).toEqual(makeEmptyResult());
    });

    // Every failure other than "empty" is about GitHub or the request, not about the username, so
    // caching one would keep answering a transient outage for the whole TTL.
    it.each<CommitErrorKind>(["rate_limit", "timeout", "unavailable", "validation", "unknown"])(
      "never caches a %s failure",
      (errorKind) => {
        setCachedCommitSearch(
          "octo",
          { found: false, error: "Something went wrong.", errorKind, commits: [] },
          1_000,
        );

        expect(getCachedCommitSearch("octo", 1_100)).toBeNull();
      },
    );

    it("never caches a failure with no error kind at all", () => {
      setCachedCommitSearch("octo", { found: false, commits: [] }, 1_000);

      expect(getCachedCommitSearch("octo", 1_100)).toBeNull();
    });

    it("does not let a failure evict a cached result for the same user", () => {
      setCachedCommitSearch("octo", makeCommitSearchResult(), 1_000);
      setCachedCommitSearch(
        "octo",
        { found: false, error: "Something went wrong.", errorKind: "unavailable", commits: [] },
        1_100,
      );

      expect(getCachedCommitSearch("octo", 1_200)).toEqual(makeCommitSearchResult());
    });
  });
});
