import { beforeEach, describe, expect, it } from "vitest";
import type { CommitData } from "./actions";
import {
  clearCommitSearchCache,
  getCachedCommitSearch,
  setCachedCommitSearch,
} from "./commitSearchCache";

const commitSearchResult: CommitData = {
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

describe("commit search cache", () => {
  beforeEach(() => {
    clearCommitSearchCache();
  });

  it("returns copies so callers cannot mutate cached results", () => {
    setCachedCommitSearch("octo", commitSearchResult, 1_000);

    const cachedResult = getCachedCommitSearch("octo", 1_100);
    cachedResult?.commits.push({
      ...commitSearchResult.commits[0],
      sha: "mutated",
    });
    if (cachedResult?.commits[0]) {
      cachedResult.commits[0].repository.name = "mutated";
    }

    expect(getCachedCommitSearch("octo", 1_200)).toEqual(commitSearchResult);
  });

  it("caps the number of cached entries", () => {
    for (let index = 0; index < 101; index += 1) {
      setCachedCommitSearch(`octo-${index}`, commitSearchResult, 1_000);
    }

    expect(getCachedCommitSearch("octo-0", 1_100)).toBeNull();
    expect(getCachedCommitSearch("octo-100", 1_100)).toEqual(commitSearchResult);
  });

  it("refreshes recently read entries before pruning the oldest entries", () => {
    for (let index = 0; index < 100; index += 1) {
      setCachedCommitSearch(`octo-${index}`, commitSearchResult, 1_000);
    }

    getCachedCommitSearch("octo-0", 1_100);
    setCachedCommitSearch("octo-100", commitSearchResult, 1_200);

    expect(getCachedCommitSearch("octo-0", 1_300)).toEqual(commitSearchResult);
    expect(getCachedCommitSearch("octo-1", 1_300)).toBeNull();
  });
});
