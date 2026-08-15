import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCommits } from "../actions";
import type { CommitData } from "../commitTypes";
import { useCommitSearch } from "./useCommitSearch";

vi.mock("../actions", () => ({ getCommits: vi.fn() }));
vi.mock("./analytics", () => ({ trackAppEvent: vi.fn() }));

const mockGetCommits = vi.mocked(getCommits);

const foundResult: CommitData = {
  found: true,
  commits: [
    {
      message: "Initial commit",
      date: "2020-01-02T03:04:05Z",
      html_url: "https://github.com/octocat/repo/commit/abc123",
      sha: "abc123",
      repository: { name: "repo", owner: "octocat", full_name: "octocat/repo" },
      author: {
        login: "octocat",
        avatar_url: "https://github.com/ghost.png",
        html_url: "https://github.com/octocat",
      },
    },
  ],
};

const partialResult: CommitData = { ...foundResult, incomplete: true };

const rateLimitedResult: CommitData = {
  found: false,
  error: "GitHub rate limit reached. Please try again in a few minutes.",
  errorKind: "rate_limit",
  commits: [],
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

afterEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

async function searchAndSettle(
  result: ReturnType<typeof renderHook<ReturnType<typeof useCommitSearch>, unknown>>["result"],
  username: string,
  options?: Parameters<ReturnType<typeof useCommitSearch>["runSearch"]>[1],
) {
  await act(async () => {
    result.current.runSearch(username, options);
  });
}

describe("useCommitSearch busy state", () => {
  it("is busy while a search is in flight and idle once it settles", async () => {
    const slowSearch = createDeferred<CommitData>();
    mockGetCommits.mockReturnValue(slowSearch.promise);
    const { result } = renderHook(() => useCommitSearch());

    expect(result.current.isSearching).toBe(false);

    act(() => {
      result.current.runSearch("octocat");
    });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(true);
    });

    await act(async () => {
      slowSearch.resolve(foundResult);
      await slowSearch.promise;
    });

    expect(result.current.isSearching).toBe(false);
  });

  it("does not become busy for a username the search layer rejects", () => {
    const { result } = renderHook(() => useCommitSearch());

    act(() => {
      result.current.runSearch("bad_name");
    });

    // The rejected search never settles, so a busy flag set here would never clear.
    expect(result.current.isSearching).toBe(false);
    expect(mockGetCommits).not.toHaveBeenCalled();
  });

  it("stops being busy when a pending search is abandoned", async () => {
    const slowSearch = createDeferred<CommitData>();
    mockGetCommits.mockReturnValue(slowSearch.promise);
    const { result } = renderHook(() => useCommitSearch());

    act(() => {
      result.current.runSearch("octocat");
    });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(true);
    });

    act(() => {
      result.current.cancelPendingSearch();
    });

    // Otherwise the search form stays disabled and labelled "Searching..." until the
    // abandoned request resolves, which can take the full GitHub timeout.
    expect(result.current.isSearching).toBe(false);

    await act(async () => {
      slowSearch.resolve(foundResult);
      await slowSearch.promise;
    });

    expect(result.current.result).toBeNull();
    expect(result.current.isSearching).toBe(false);
  });
});

describe("useCommitSearch concurrency", () => {
  it("applies only the latest of two searches started in the same flush", async () => {
    const staleResult: CommitData = {
      found: true,
      commits: [{ ...foundResult.commits[0]!, message: "Stale search result" }],
    };
    const stale = createDeferred<CommitData>();
    const latest = createDeferred<CommitData>();
    mockGetCommits.mockReturnValueOnce(stale.promise).mockReturnValueOnce(latest.promise);
    const { result } = renderHook(() => useCommitSearch());

    act(() => {
      result.current.runSearch("octocat");
      result.current.runSearch("torvalds");
    });

    await act(async () => {
      latest.resolve(foundResult);
      await latest.promise;
      stale.resolve(staleResult);
      await stale.promise;
    });

    // Both calls are synchronous, so the latest-search marker is already updated by the
    // time the second one reads it -- which is why the ids are distinct under either
    // computation. What this pins is the outcome: the slower first search cannot win.
    expect(result.current.result).toEqual(foundResult);
  });

  it("does not let a rejected search orphan one already in flight", async () => {
    const slowSearch = createDeferred<CommitData>();
    mockGetCommits.mockReturnValue(slowSearch.promise);
    const { result } = renderHook(() => useCommitSearch());

    act(() => {
      result.current.runSearch("octocat");
    });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(true);
    });

    // "bad_name" is refused by the username rule in app/username.ts, which is what makes
    // this a rejection rather than a second search; loosening that rule would weaken this
    // test rather than fail it.
    // Rejected before it starts, so it must not claim the latest-search marker. Sharing
    // one counter would let it, and the in-flight search would then be discarded without
    // ever reaching applyResult -- leaving the form disabled with nothing to clear it.
    act(() => {
      result.current.runSearch("bad_name");
    });

    await act(async () => {
      slowSearch.resolve(foundResult);
      await slowSearch.promise;
    });

    expect(result.current.result).toEqual(foundResult);
    expect(result.current.isSearching).toBe(false);
  });
});

describe("useCommitSearch retry", () => {
  it("marks only a retry as retrying, not an ordinary search", async () => {
    const slowSearch = createDeferred<CommitData>();
    mockGetCommits.mockReturnValue(slowSearch.promise);
    const { result } = renderHook(() => useCommitSearch());

    act(() => {
      result.current.runSearch("octocat");
    });
    await waitFor(() => {
      expect(result.current.isSearching).toBe(true);
    });
    expect(result.current.isRetrying).toBe(false);

    await act(async () => {
      slowSearch.resolve(partialResult);
      await slowSearch.promise;
    });

    const slowRetry = createDeferred<CommitData>();
    mockGetCommits.mockReturnValue(slowRetry.promise);

    act(() => {
      result.current.runSearch("octocat", { isRetry: true });
    });
    await waitFor(() => {
      expect(result.current.isRetrying).toBe(true);
    });

    await act(async () => {
      slowRetry.resolve(foundResult);
      await slowRetry.promise;
    });

    expect(result.current.isRetrying).toBe(false);
  });

  it("keeps the displayed result when a retry fails, and explains why", async () => {
    mockGetCommits.mockResolvedValueOnce(partialResult).mockResolvedValueOnce(rateLimitedResult);
    const { result } = renderHook(() => useCommitSearch());

    await searchAndSettle(result, "octocat");
    expect(result.current.result).toEqual(partialResult);

    await searchAndSettle(result, "octocat", { isRetry: true });

    expect(result.current.result).toEqual(partialResult);
    expect(result.current.retryError).toBe(
      "GitHub is rate limiting searches right now, so wait a few minutes before searching again.",
    );
    expect(result.current.isRetrying).toBe(false);
  });

  it("reports a retry that succeeded but is still partial", async () => {
    mockGetCommits.mockResolvedValue(partialResult);
    const { result } = renderHook(() => useCommitSearch());

    await searchAndSettle(result, "octocat");
    expect(result.current.retryStillPartial).toBe(false);

    await searchAndSettle(result, "octocat", { isRetry: true });

    // Nothing else on screen changes in this case, so without this flag a completed
    // retry is indistinguishable from a button that did nothing.
    expect(result.current.retryStillPartial).toBe(true);
  });

  it("clears retry outcomes when a later search starts", async () => {
    mockGetCommits
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(rateLimitedResult)
      .mockResolvedValueOnce(partialResult);
    const { result } = renderHook(() => useCommitSearch());

    await searchAndSettle(result, "octocat");
    await searchAndSettle(result, "octocat", { isRetry: true });
    expect(result.current.retryError).not.toBe("");

    await searchAndSettle(result, "octocat", { isRetry: true });

    expect(result.current.retryError).toBe("");
    expect(result.current.retryStillPartial).toBe(true);
  });

  it("replaces the result when a retry succeeds completely", async () => {
    mockGetCommits.mockResolvedValueOnce(partialResult).mockResolvedValueOnce(foundResult);
    const { result } = renderHook(() => useCommitSearch());

    await searchAndSettle(result, "octocat");
    await searchAndSettle(result, "octocat", { isRetry: true });

    expect(result.current.result).toEqual(foundResult);
    expect(result.current.result?.incomplete).toBeUndefined();
    expect(result.current.retryStillPartial).toBe(false);
  });

  it("does not call a first partial answer a repeat when the retry followed an error", async () => {
    mockGetCommits.mockResolvedValueOnce(rateLimitedResult).mockResolvedValueOnce(partialResult);
    const { result } = renderHook(() => useCommitSearch());

    await searchAndSettle(result, "octocat");
    await searchAndSettle(result, "octocat", { isRetry: true });

    expect(result.current.result).toEqual(partialResult);
    expect(result.current.retryStillPartial).toBe(false);
  });

  it("replaces the error when a retry from the error panel fails again", async () => {
    mockGetCommits.mockResolvedValueOnce(rateLimitedResult).mockResolvedValueOnce({
      found: false,
      error: "GitHub is temporarily unavailable. Please try again soon.",
      errorKind: "unavailable",
      commits: [],
    });
    const { result } = renderHook(() => useCommitSearch());

    await searchAndSettle(result, "octocat");
    await searchAndSettle(result, "octocat", { isRetry: true });

    // Preservation is for a result worth keeping; there is none here, so the new error
    // must replace the old one rather than leaving stale copy on screen.
    expect(result.current.result?.errorKind).toBe("unavailable");
    expect(result.current.retryError).toBe("");
  });

  it("still replaces a failed ordinary search, so only retries preserve results", async () => {
    mockGetCommits.mockResolvedValueOnce(partialResult).mockResolvedValueOnce(rateLimitedResult);
    const { result } = renderHook(() => useCommitSearch());

    await searchAndSettle(result, "octocat");
    await searchAndSettle(result, "octocat");

    expect(result.current.result).toEqual(rateLimitedResult);
    expect(result.current.retryError).toBe("");
  });
});
