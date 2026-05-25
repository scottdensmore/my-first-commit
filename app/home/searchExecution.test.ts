import { afterEach, describe, expect, it, vi } from "vitest";
import { getCommits } from "../actions";
import type { CommitData, CommitInfo } from "../commitTypes";
import { trackAppEvent } from "./analytics";
import { saveStoredRecentSearches } from "./recentSearches";
import { runCommitSearch } from "./searchExecution";
import { updateSharedSearchUrl } from "./sharedSearch";

vi.mock("../actions", () => ({ getCommits: vi.fn() }));
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

// The real `startTransition` runs its callback in a React transition; the test
// double runs it immediately and exposes the resulting promise so assertions
// can await the async search work.
function createHandlers() {
  let pending: Promise<unknown> | undefined;
  const handlers = {
    startTransition: vi.fn((callback: () => unknown) => {
      pending = Promise.resolve(callback());
    }),
    setLastSearchedUsername: vi.fn(),
    setShareStatus: vi.fn(),
    setResult: vi.fn(),
    setRecentSearches: vi.fn(),
  };
  return { handlers, settle: () => pending };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("runCommitSearch", () => {
  it("ignores blank usernames", () => {
    const { handlers } = createHandlers();
    runCommitSearch("   ", {}, handlers);

    expect(handlers.startTransition).not.toHaveBeenCalled();
    expect(trackAppEvent).not.toHaveBeenCalled();
  });

  it("ignores invalid usernames", () => {
    const { handlers } = createHandlers();
    runCommitSearch("bad_name", {}, handlers);

    expect(handlers.startTransition).not.toHaveBeenCalled();
  });

  it("updates the shared URL and tracks a user-sourced search", async () => {
    vi.mocked(getCommits).mockResolvedValue(foundResult);
    const { handlers, settle } = createHandlers();

    runCommitSearch("octocat", { updateUrl: true }, handlers);
    await settle();

    expect(updateSharedSearchUrl).toHaveBeenCalledWith("octocat");
    expect(handlers.setLastSearchedUsername).toHaveBeenCalledWith("octocat");
    expect(handlers.setShareStatus).toHaveBeenCalledWith("");
    expect(handlers.setResult).toHaveBeenCalledWith(foundResult);
    expect(trackAppEvent).toHaveBeenCalledWith("search_submitted", { source: "user" });
    expect(trackAppEvent).toHaveBeenCalledWith("search_completed", {
      found: true,
      error_kind: "none",
      commit_count: 1,
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
    });
  });
});
