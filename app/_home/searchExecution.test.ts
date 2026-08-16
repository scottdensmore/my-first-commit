import { afterEach, describe, expect, it, vi } from "vitest";
import { getCommits } from "../_lib/actions";
import type { CommitData, CommitInfo } from "../_lib/commitTypes";
import { trackAppEvent } from "./analytics";
import { saveStoredRecentSearches } from "./recentSearches";
import { runCommitSearch } from "./searchExecution";
import { updateSharedSearchUrl } from "./sharedSearch";

vi.mock("../_lib/actions", () => ({ getCommits: vi.fn() }));
vi.mock("./analytics", () => ({ trackAppEvent: vi.fn() }));
vi.mock("./recentSearches", () => ({ saveStoredRecentSearches: vi.fn() }));
vi.mock("./sharedSearch", () => ({ updateSharedSearchUrl: vi.fn() }));

const commit: CommitInfo = {
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
};

const foundResult: CommitData = { found: true, commits: [commit] };

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

// The real `startTransition` runs its callback in a React transition; the test
// double runs it immediately and exposes the resulting promise so assertions
// can await the async search work.
function createHandlers() {
  let pending: Promise<unknown> | undefined;
  const handlers = {
    isLatestSearch: vi.fn(() => true),
    startTransition: vi.fn((callback: () => unknown) => {
      pending = Promise.resolve(callback());
    }),
    setLastSearchedUsername: vi.fn(),
    setShareStatus: vi.fn(),
    applyResult: vi.fn(),
    setRecentSearches: vi.fn(),
  };
  return { handlers, settle: () => pending };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("runCommitSearch", () => {
  it("ignores blank usernames and reports that it did not start", () => {
    const { handlers } = createHandlers();

    expect(runCommitSearch("   ", {}, handlers)).toBe(false);
    expect(handlers.startTransition).not.toHaveBeenCalled();
    expect(trackAppEvent).not.toHaveBeenCalled();
  });

  it("ignores invalid usernames and reports that it did not start", () => {
    const { handlers } = createHandlers();

    expect(runCommitSearch("bad_name", {}, handlers)).toBe(false);
    expect(handlers.startTransition).not.toHaveBeenCalled();
  });

  it("reports that it started so the caller can own the busy flag", () => {
    vi.mocked(getCommits).mockResolvedValue(foundResult);
    const { handlers } = createHandlers();

    expect(runCommitSearch("octocat", {}, handlers)).toBe(true);
  });

  it("attributes a retry to its own source rather than inferring a shared link", async () => {
    vi.mocked(getCommits).mockResolvedValue(foundResult);
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", { source: "retry" }, handlers);
    await settle();

    expect(trackAppEvent).toHaveBeenCalledWith("search_submitted", { source: "retry" });
  });

  it("updates the shared URL and tracks a user-sourced search", async () => {
    vi.mocked(getCommits).mockResolvedValue(foundResult);
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", { updateUrl: true }, handlers);
    await settle();

    expect(updateSharedSearchUrl).toHaveBeenCalledWith("octocat");
    expect(handlers.setLastSearchedUsername).toHaveBeenCalledWith("octocat");
    expect(handlers.setShareStatus).toHaveBeenCalledWith("");
    expect(handlers.applyResult).toHaveBeenCalledWith(foundResult);
    expect(trackAppEvent).toHaveBeenCalledWith("search_submitted", { source: "user" });
    expect(trackAppEvent).toHaveBeenCalledWith("search_completed", {
      found: true,
      error_kind: "none",
      commit_count: 1,
      incomplete: false,
    });
  });

  it("reports partial results in the completion event", async () => {
    vi.mocked(getCommits).mockResolvedValue({ ...foundResult, incomplete: true });
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", {}, handlers);
    await settle();

    expect(trackAppEvent).toHaveBeenCalledWith("search_completed", {
      found: true,
      error_kind: "none",
      commit_count: 1,
      incomplete: true,
    });
  });

  it("does not touch the URL for shared-link searches", async () => {
    vi.mocked(getCommits).mockResolvedValue(foundResult);
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", {}, handlers);
    await settle();

    expect(updateSharedSearchUrl).not.toHaveBeenCalled();
    expect(trackAppEvent).toHaveBeenCalledWith("search_submitted", { source: "shared_url" });
  });

  it("persists successful searches, de-duplicating case-insensitively", async () => {
    vi.mocked(getCommits).mockResolvedValue(foundResult);
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", {}, handlers);
    await settle();

    expect(handlers.setRecentSearches).toHaveBeenCalledTimes(1);
    const updater = handlers.setRecentSearches.mock.calls[0][0] as (prev: string[]) => string[];
    const next = updater(["OCTOCAT", "torvalds"]);

    expect(next).toEqual(["octocat", "torvalds"]);
    expect(saveStoredRecentSearches).toHaveBeenCalledWith(["octocat", "torvalds"]);
  });

  it("does not record recent searches for unsuccessful results", async () => {
    vi.mocked(getCommits).mockResolvedValue({ found: false, errorKind: "empty", commits: [] });
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", {}, handlers);
    await settle();

    expect(handlers.setRecentSearches).not.toHaveBeenCalled();
    expect(trackAppEvent).toHaveBeenCalledWith("search_completed", {
      found: false,
      error_kind: "empty",
      commit_count: 0,
      incomplete: false,
    });
  });

  it("normalizes unexpected Server Action rejections as retryable unknown errors", async () => {
    vi.mocked(getCommits).mockRejectedValue(
      new Error("Sensitive upstream detail: q=author:octocat&token=secret"),
    );
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", {}, handlers);

    await expect(settle()).resolves.toBeUndefined();
    expect(handlers.applyResult).toHaveBeenCalledWith({
      found: false,
      error: "GitHub commit search failed. Please try again.",
      errorKind: "unknown",
      commits: [],
    });
    expect(handlers.setRecentSearches).not.toHaveBeenCalled();
    expect(trackAppEvent).toHaveBeenLastCalledWith("search_completed", {
      found: false,
      error_kind: "unknown",
      commit_count: 0,
      incomplete: false,
    });
    expect(JSON.stringify(handlers.applyResult.mock.calls)).not.toContain("octocat");
    expect(JSON.stringify(handlers.applyResult.mock.calls)).not.toContain("secret");
  });

  it("ignores an earlier search that resolves after the latest request", async () => {
    const staleSearch = createDeferred<CommitData>();
    const latestSearch = createDeferred<CommitData>();
    const staleResult: CommitData = {
      found: true,
      commits: [{ ...commit, message: "Stale search result" }],
    };
    const latestResult: CommitData = {
      found: true,
      commits: [{ ...commit, message: "Latest search result" }],
    };
    vi.mocked(getCommits).mockImplementation((username) =>
      username === "octocat" ? staleSearch.promise : latestSearch.promise,
    );
    const pendingSearches: Promise<unknown>[] = [];
    const handlers = {
      startTransition: vi.fn((callback: () => unknown) => {
        pendingSearches.push(Promise.resolve(callback()));
      }),
      setLastSearchedUsername: vi.fn(),
      setShareStatus: vi.fn(),
      applyResult: vi.fn(),
      setRecentSearches: vi.fn(),
    };
    let latestSearchId = 0;
    const startSearch = (username: string) => {
      const searchId = ++latestSearchId;
      runCommitSearch(
        username,
        {},
        {
          ...handlers,
          isLatestSearch: () => searchId === latestSearchId,
        },
      );
    };

    startSearch("octocat");
    startSearch("torvalds");
    latestSearch.resolve(latestResult);
    await pendingSearches[1];
    staleSearch.resolve(staleResult);
    await pendingSearches[0];

    expect(handlers.setLastSearchedUsername).toHaveBeenLastCalledWith("torvalds");
    expect(handlers.applyResult).toHaveBeenCalledOnce();
    expect(handlers.applyResult).toHaveBeenCalledWith(latestResult);
    expect(handlers.setRecentSearches).toHaveBeenCalledOnce();
    expect(trackAppEvent).toHaveBeenCalledTimes(3);
    expect(trackAppEvent).toHaveBeenLastCalledWith("search_completed", {
      found: true,
      error_kind: "none",
      commit_count: 1,
      incomplete: false,
    });
  });
});
