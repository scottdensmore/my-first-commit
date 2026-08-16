import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitData } from "./commitTypes";
import {
  clearInFlightCommitSearches,
  coalesceCommitSearch,
  inFlightCommitSearchCount,
} from "./commitSearchInFlight";

// A factory, not a shared const: a test that mutates a result must not be able to reach the
// fixture other tests compare against, or the mutation itself becomes the reason they fail.
function makeFoundResult(): CommitData {
  return {
    found: true,
    commits: [
      {
        message: "Initial commit",
        date: "2024-01-02T00:00:00Z",
        html_url: "https://github.com/octo/repo/commit/abcdef123456",
        sha: "abcdef123456",
        repository: { name: "repo", owner: "octo", full_name: "octo/repo" },
        author: {
          login: "octo",
          avatar_url: "https://github.com/octo.png",
          html_url: "https://github.com/octo",
        },
      },
    ],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

beforeEach(() => {
  clearInFlightCommitSearches();
});

describe("coalesceCommitSearch", () => {
  it("runs one search for callers that arrive while it is in flight", async () => {
    const deferred = createDeferred<CommitData>();
    const startSearch = vi.fn(() => deferred.promise);

    const first = coalesceCommitSearch("octo", startSearch);
    const second = coalesceCommitSearch("octo", startSearch);
    deferred.resolve(makeFoundResult());

    await expect(first).resolves.toEqual(makeFoundResult());
    await expect(second).resolves.toEqual(makeFoundResult());
    expect(startSearch).toHaveBeenCalledTimes(1);
  });

  it("keeps searches for different keys apart", async () => {
    const startSearch = vi.fn(async () => makeFoundResult());

    await Promise.all([
      coalesceCommitSearch("octo", startSearch),
      coalesceCommitSearch("torvalds", startSearch),
    ]);

    expect(startSearch).toHaveBeenCalledTimes(2);
  });

  it("gives every caller its own copy of the shared result", async () => {
    const sourceResult = makeFoundResult();
    const deferred = createDeferred<CommitData>();
    const startSearch = vi.fn(() => deferred.promise);

    // Three callers: the one that starts the search and two that join it. Two joiners are
    // needed to pin the joining path -- with one, the starter already holds a copy, so a
    // shared object handed to the joiner would go unnoticed.
    const starter = coalesceCommitSearch("octo", startSearch);
    const joiner = coalesceCommitSearch("octo", startSearch);
    const otherJoiner = coalesceCommitSearch("octo", startSearch);
    deferred.resolve(sourceResult);

    const [starterResult, joinerResult, otherJoinerResult] = await Promise.all([
      starter,
      joiner,
      otherJoiner,
    ]);

    expect(starterResult).not.toBe(sourceResult);
    expect(joinerResult).not.toBe(sourceResult);
    expect(joinerResult).not.toBe(starterResult);
    expect(otherJoinerResult).not.toBe(joinerResult);

    joinerResult.commits[0]!.message = "mutated by a joiner";

    expect(otherJoinerResult.commits[0]!.message).toBe("Initial commit");
    expect(starterResult.commits[0]!.message).toBe("Initial commit");
  });

  it("releases the key once the search settles, so a later caller starts a new one", async () => {
    const startSearch = vi.fn(async () => makeFoundResult());

    await coalesceCommitSearch("octo", startSearch);
    expect(inFlightCommitSearchCount()).toBe(0);

    await coalesceCommitSearch("octo", startSearch);

    expect(startSearch).toHaveBeenCalledTimes(2);
  });

  it("releases the key when the search rejects, so a failure cannot wedge it", async () => {
    const deferred = createDeferred<CommitData>();
    const startSearch = vi.fn(() => deferred.promise);

    const first = coalesceCommitSearch("octo", startSearch);
    const second = coalesceCommitSearch("octo", startSearch);
    deferred.reject(new Error("GitHub is unavailable"));

    await expect(first).rejects.toThrow("GitHub is unavailable");
    await expect(second).rejects.toThrow("GitHub is unavailable");
    // Left in place, every later search for this username would reject forever.
    expect(inFlightCommitSearchCount()).toBe(0);
  });

  it("releases the key when the search throws synchronously", async () => {
    const startSearch = vi.fn(() => {
      throw new Error("Synthetic rejection");
    });

    await expect(coalesceCommitSearch("octo", startSearch)).rejects.toThrow("Synthetic rejection");
    expect(inFlightCommitSearchCount()).toBe(0);
  });
});
