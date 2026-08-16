import { beforeEach, describe, expect, it } from "vitest";
import type { CommitData } from "./commitTypes";
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
});
