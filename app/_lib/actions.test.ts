import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCommitSearchCache } from "./commitSearchCache";
import { clearInFlightCommitSearches } from "./commitSearchInFlight";
import {
  COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES,
  COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS,
  clearCommitSearchRateLimit,
  trackedCommitSearchClientKeys,
} from "./commitSearchRateLimit";
import { hashClientIdentifier } from "./searchClientKey";
import { getCommits } from "./actions";

const invokeGetCommits = getCommits as unknown as (
  username: unknown,
) => ReturnType<typeof getCommits>;

const { searchCommits } = vi.hoisted(() => ({
  searchCommits: vi.fn(),
}));

const { headers } = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers,
}));

/** Makes the next searches look like they came from `address`, or from an unknown client. */
function requestsFromClient(address: string | null) {
  headers.mockResolvedValue({
    get: (name: string) => (name === "x-vercel-forwarded-for" ? address : null),
  });
}

vi.mock("octokit", () => ({
  Octokit: vi.fn(function Octokit() {
    return {
      rest: {
        search: {
          commits: searchCommits,
        },
      },
    };
  }),
}));

const commitItem = {
  commit: {
    message: "Initial commit\n\nAdd project files",
    author: {
      date: "2024-01-01T00:00:00Z",
    },
    committer: {
      date: "2024-01-02T00:00:00Z",
    },
  },
  html_url: "https://github.com/octo/repo/commit/abcdef123456",
  sha: "abcdef123456",
  repository: {
    name: "repo",
    full_name: "octo/repo",
    owner: {
      login: "octo",
    },
  },
  author: {
    login: "octo",
    avatar_url: "https://github.com/octo.png",
    html_url: "https://github.com/octo",
  },
};

describe("getCommits", () => {
  beforeEach(() => {
    clearCommitSearchCache();
    clearInFlightCommitSearches();
    clearCommitSearchRateLimit();
    searchCommits.mockReset();
    headers.mockReset();
    requestsFromClient(null);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // A no-op unless a test installed the fake clock, and the one thing restoreAllMocks does not
    // undo. Leaving it installed would hand the next test file a frozen Date.
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns a validation error when username is missing", async () => {
    await expect(getCommits("")).resolves.toEqual({
      found: false,
      error: "Username is required",
      errorKind: "validation",
      commits: [],
    });
    expect(searchCommits).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["array", []],
    ["object", {}],
    ["number", 42],
    ["true boolean", true],
    ["false boolean", false],
    ["duck-typed object", { trim: () => "octo" }],
  ])("returns a validation error for hostile %s Server Action input", async (_label, input) => {
    await expect(invokeGetCommits(input)).resolves.toEqual({
      found: false,
      error: "Username is required",
      errorKind: "validation",
      commits: [],
    });
    expect(searchCommits).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("queries GitHub for the earliest commits by author", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [commitItem],
      },
    });

    await getCommits("octo");

    expect(searchCommits).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "author:octo",
        sort: "committer-date",
        order: "asc",
        per_page: 10,
        request: {
          signal: expect.any(AbortSignal),
        },
      }),
    );
  });

  it("maps GitHub commit search results into display data", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [commitItem],
      },
    });

    await expect(getCommits("octo")).resolves.toEqual({
      found: true,
      commits: [
        {
          message: "Initial commit\n\nAdd project files",
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
    });
  });

  it("rejects invalid usernames before calling GitHub", async () => {
    await expect(getCommits("octo_cat")).resolves.toEqual({
      found: false,
      error: "Use only letters, numbers, and hyphens.",
      errorKind: "validation",
      commits: [],
    });
    expect(searchCommits).not.toHaveBeenCalled();
  });

  it("trims usernames before querying GitHub", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [commitItem],
      },
    });

    await getCommits("  octo  ");

    expect(searchCommits).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "author:octo",
      }),
    );
  });

  it("reuses cached successful search results for the same username", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [commitItem],
      },
    });

    await getCommits("Octo");
    await getCommits("octo");

    expect(searchCommits).toHaveBeenCalledTimes(1);
  });

  it("falls back to committer date and ghost author details when GitHub omits author data", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [
          {
            ...commitItem,
            commit: {
              ...commitItem.commit,
              author: null,
            },
            author: null,
          },
        ],
      },
    });

    const result = await getCommits("octo");

    expect(result.commits[0]).toMatchObject({
      date: "2024-01-02T00:00:00Z",
      author: {
        login: "octo",
        avatar_url: "https://github.com/ghost.png",
        html_url: "https://github.com/octo",
      },
    });
  });

  it("falls back to a parseable author date when the committer date is invalid", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [
          {
            ...commitItem,
            commit: {
              ...commitItem.commit,
              committer: {
                date: "not-a-date",
              },
            },
          },
        ],
      },
    });

    const result = await getCommits("octo");

    expect(result.commits[0].date).toBe("2024-01-01T00:00:00Z");
  });

  it("skips commit items without a parseable date while keeping valid results", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [
          {
            ...commitItem,
            commit: {
              ...commitItem.commit,
              author: null,
              committer: null,
            },
          },
          commitItem,
        ],
      },
    });

    const result = await getCommits("octo");

    expect(result.found).toBe(true);
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].sha).toBe("abcdef123456");
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_malformed_item",
      itemIndex: 0,
    });
  });

  it("returns an empty state when every commit date is missing, empty, or invalid", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [
          {
            ...commitItem,
            commit: {
              ...commitItem.commit,
              author: null,
              committer: null,
            },
          },
          {
            ...commitItem,
            commit: {
              ...commitItem.commit,
              author: { date: "" },
              committer: { date: "not-a-date" },
            },
          },
        ],
      },
    });

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "No public commits found for this user (or indexing is delayed).",
      errorKind: "empty",
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it("returns a friendly empty state when no indexed commits are found", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [],
      },
    });

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "No public commits found for this user (or indexing is delayed).",
      errorKind: "empty",
      commits: [],
    });
  });

  it("marks partial results when GitHub reports an incomplete search", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [commitItem],
        incomplete_results: true,
      },
    });

    const result = await getCommits("octo");

    expect(result.found).toBe(true);
    expect(result.incomplete).toBe(true);
    expect(result.commits).toHaveLength(1);
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_incomplete",
      itemCount: 1,
    });
  });

  it("does not cache an incomplete search, so a retry can reach a complete result", async () => {
    searchCommits.mockResolvedValueOnce({
      data: {
        items: [commitItem],
        incomplete_results: true,
      },
    });
    searchCommits.mockResolvedValueOnce({
      data: {
        items: [commitItem],
        incomplete_results: false,
      },
    });

    const incompleteResult = await getCommits("octo");
    const completeResult = await getCommits("octo");

    expect(searchCommits).toHaveBeenCalledTimes(2);
    expect(incompleteResult.incomplete).toBe(true);
    expect(completeResult.incomplete).toBeUndefined();
  });

  it("marks an incomplete empty search as partial and does not cache it", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [],
        incomplete_results: true,
      },
    });

    const result = await getCommits("octo");
    await getCommits("octo");

    expect(result).toEqual({
      found: false,
      error: "GitHub could not finish this search, so no commits were returned yet.",
      errorKind: "empty",
      incomplete: true,
      commits: [],
    });
    expect(searchCommits).toHaveBeenCalledTimes(2);
  });

  it("caches and does not mark complete searches as partial", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [commitItem],
        incomplete_results: false,
      },
    });

    const result = await getCommits("octo");
    await getCommits("octo");

    expect(result.incomplete).toBeUndefined();
    expect(searchCommits).toHaveBeenCalledTimes(1);
  });

  it("makes one GitHub call for concurrent searches of the same username", async () => {
    let resolveSearch: (value: unknown) => void = () => {};
    searchCommits.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );

    const searches = Promise.all([getCommits("octo"), getCommits("octo"), getCommits("octo")]);
    resolveSearch({ data: { items: [commitItem] } });
    const [first, second, third] = await searches;

    // One shared token quota: without this, a link shared with a crowd multiplies into one
    // upstream search per reader, all asking the identical question.
    expect(searchCommits).toHaveBeenCalledTimes(1);
    expect(first.found).toBe(true);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    // Equal, not identical: toEqual alone would pass if all three shared one object.
    expect(second).not.toBe(first);
    expect(third).not.toBe(second);
  });

  it("coalesces concurrent searches that differ only by case", async () => {
    let resolveSearch: (value: unknown) => void = () => {};
    searchCommits.mockReturnValue(
      new Promise((resolve) => {
        resolveSearch = resolve;
      }),
    );

    const searches = Promise.all([getCommits("Octo"), getCommits("octo"), getCommits("  OCTO  ")]);
    resolveSearch({ data: { items: [commitItem] } });
    await searches;

    expect(searchCommits).toHaveBeenCalledTimes(1);
  });

  it("does not coalesce concurrent searches for different usernames", async () => {
    searchCommits.mockResolvedValue({ data: { items: [commitItem] } });

    await Promise.all([getCommits("octo"), getCommits("torvalds")]);

    expect(searchCommits).toHaveBeenCalledTimes(2);
  });

  it("shares one failure across concurrent searches without wedging the username", async () => {
    let rejectSearch: (reason: unknown) => void = () => {};
    searchCommits.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSearch = reject;
      }),
    );

    const searches = Promise.all([getCommits("octo"), getCommits("octo")]);
    rejectSearch(Object.assign(new Error("boom"), { status: 500 }));
    const [first, second] = await searches;

    expect(first.errorKind).toBe("unavailable");
    expect(second.errorKind).toBe("unavailable");
    expect(searchCommits).toHaveBeenCalledTimes(1);

    // A failure must not leave the key behind, or every later search for this username
    // would replay it instead of retrying.
    searchCommits.mockResolvedValue({ data: { items: [commitItem] } });
    await expect(getCommits("octo")).resolves.toMatchObject({ found: true });
    expect(searchCommits).toHaveBeenCalledTimes(2);
  });

  it("returns a helpful rate limit message and logs a structured warning for GitHub rate-limit 403 errors", async () => {
    searchCommits.mockRejectedValue({
      status: 403,
      message: "API rate limit exceeded for user.",
      response: {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1710000000",
        },
      },
    });

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "GitHub rate limit reached. Please try again in a few minutes.",
      errorKind: "rate_limit",
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_rate_limited",
      status: 403,
      errorKind: "rate_limit",
      rateLimitRemaining: 0,
      rateLimitReset: 1710000000,
    });
  });

  it("returns a helpful rate limit message and logs a structured warning for GitHub 429 errors", async () => {
    searchCommits.mockRejectedValue({
      status: 429,
      message: "Too many requests",
    });

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "GitHub rate limit reached. Please try again in a few minutes.",
      errorKind: "rate_limit",
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_rate_limited",
      status: 429,
      errorKind: "rate_limit",
      rateLimitRemaining: undefined,
      rateLimitReset: undefined,
    });
  });

  it("logs only allowlisted numeric rate-limit metadata", async () => {
    const rawMessage =
      "Request failed: https://api.github.com/search/commits?q=author%3Aoctocat with token ghp_exampleSecret123";
    searchCommits.mockRejectedValue({
      status: 403,
      message: rawMessage,
      response: {
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1710000000 ghp_headerSecret456",
        },
      },
    });

    await expect(getCommits("octocat")).resolves.toEqual({
      found: false,
      error: "GitHub rate limit reached. Please try again in a few minutes.",
      errorKind: "rate_limit",
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_rate_limited",
      status: 403,
      errorKind: "rate_limit",
      rateLimitRemaining: 0,
      rateLimitReset: undefined,
    });
    const serializedLogs = JSON.stringify(vi.mocked(console.warn).mock.calls);
    expect(serializedLogs).not.toContain("octocat");
    expect(serializedLogs).not.toContain("api.github.com");
    expect(serializedLogs).not.toContain("q=author");
    expect(serializedLogs).not.toContain("ghp_exampleSecret123");
    expect(serializedLogs).not.toContain("ghp_headerSecret456");
  });

  // The search is given ten seconds. Spelled out rather than imported, so a change to the constant
  // has to be made here too instead of quietly moving the deadline these tests claim to pin.
  const GITHUB_SEARCH_TIMEOUT_MS = 10_000;

  /**
   * Makes the next search hang like a request that never gets a response: it settles only when the
   * signal it was handed aborts, which is what Octokit does with an aborted request.
   */
  function hangingSearchUntilAborted() {
    let searchSignal: AbortSignal | undefined;

    searchCommits.mockImplementation((options: { request?: { signal?: AbortSignal } }) => {
      searchSignal = options.request?.signal;

      return new Promise((_resolve, reject) => {
        searchSignal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    return {
      get signal() {
        return searchSignal;
      },
    };
  }

  it("aborts a hanging GitHub search at the ten-second deadline", async () => {
    vi.useFakeTimers();
    const search = hangingSearchUntilAborted();

    let settled = false;
    const pending = getCommits("octo").then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(GITHUB_SEARCH_TIMEOUT_MS - 1);

    // One millisecond short of the deadline the request is still outstanding. Without this the
    // test would pass just as well against a search aborted immediately.
    expect(searchCommits).toHaveBeenCalledTimes(1);
    expect(search.signal?.aborted).toBe(false);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);

    expect(search.signal?.aborted).toBe(true);
    await expect(pending).resolves.toEqual({
      found: false,
      error: "GitHub took too long to respond. Please try again.",
      errorKind: "timeout",
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_timeout",
      status: undefined,
      errorKind: "timeout",
    });
  });

  it("does not leave the timeout timer pending after a search that answers in time", async () => {
    vi.useFakeTimers();
    searchCommits.mockResolvedValue({ data: { items: [commitItem] } });

    await getCommits("octo");

    // The abort timer is cleared when the search settles. A leaked one would fire ten seconds
    // later against a controller nobody is listening to, and keeps a Node process alive.
    expect(vi.getTimerCount()).toBe(0);
  });

  // Complements the deadline test above: this one pins how an AbortError is reported, whatever
  // aborted the request, without waiting on the timer.
  it("returns a friendly timeout message when GitHub does not respond in time", async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    searchCommits.mockRejectedValue(error);

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "GitHub took too long to respond. Please try again.",
      errorKind: "timeout",
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_timeout",
      status: undefined,
      errorKind: "timeout",
    });
  });

  it("returns a friendly unavailable message without logging raw GitHub error details", async () => {
    const rawMessage =
      "Request failed: https://api.github.com/search/commits?q=author%3Aoctocat with token ghp_exampleSecret123";
    const error = {
      status: 503,
      message: rawMessage,
    };
    searchCommits.mockRejectedValue(error);

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "GitHub is temporarily unavailable. Please try again soon.",
      errorKind: "unavailable",
      commits: [],
    });
    expect(console.error).toHaveBeenCalledWith({
      event: "github_commit_search_unavailable",
      status: 503,
      errorKind: "unavailable",
    });
    const serializedLogs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(serializedLogs).not.toContain("octocat");
    expect(serializedLogs).not.toContain("api.github.com");
    expect(serializedLogs).not.toContain("q=author");
    expect(serializedLogs).not.toContain("ghp_exampleSecret123");
  });

  it("does not classify non-rate-limit GitHub 403 errors as rate limits", async () => {
    const error = {
      status: 403,
      message: "Resource not accessible by integration",
    };
    searchCommits.mockRejectedValue(error);

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "Failed to fetch commits.",
      errorKind: "unknown",
      commits: [],
    });
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith({
      event: "github_commit_search_failed",
      status: 403,
      errorKind: "unknown",
    });
  });

  it("ignores malformed GitHub commit items before deciding whether results exist", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [
          {
            ...commitItem,
            sha: "",
          },
          commitItem,
        ],
      },
    });

    const result = await getCommits("octo");

    expect(result.found).toBe(true);
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].sha).toBe("abcdef123456");
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_malformed_item",
      itemIndex: 0,
    });
  });

  it("returns an empty state when GitHub only returns malformed commit items", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [
          {
            ...commitItem,
            html_url: "",
          },
        ],
      },
    });

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "No public commits found for this user (or indexing is delayed).",
      errorKind: "empty",
      commits: [],
    });
  });

  it("returns a validation message for GitHub 422 errors", async () => {
    const error = { status: 422 };
    searchCommits.mockRejectedValue(error);

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "Validation failed. User might not exist.",
      errorKind: "validation",
      commits: [],
    });
    expect(console.error).toHaveBeenCalledWith({
      event: "github_commit_search_failed",
      status: 422,
      errorKind: "validation",
    });
  });

  it("returns a generic message for unknown GitHub errors", async () => {
    const error = new Error("GitHub is unavailable");
    searchCommits.mockRejectedValue(error);

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "Failed to fetch commits.",
      errorKind: "unknown",
      commits: [],
    });
    expect(console.error).toHaveBeenCalledWith({
      event: "github_commit_search_failed",
      status: undefined,
      errorKind: "unknown",
    });
  });

  describe("per-client burst limit", () => {
    const CLIENT_ADDRESS = "203.0.113.7";

    /** Distinct usernames, so every search is a genuine cache and coalescer miss. */
    function distinctUsernames(count: number) {
      return Array.from({ length: count }, (_unused, index) => `octo${index}`);
    }

    async function searchEach(usernames: string[]) {
      const results = [];
      for (const username of usernames) {
        results.push(await getCommits(username));
      }
      return results;
    }

    beforeEach(() => {
      requestsFromClient(CLIENT_ADDRESS);
      searchCommits.mockResolvedValue({ data: { items: [commitItem] } });
    });

    it("answers a burst past the bound with the existing rate-limit result", async () => {
      await searchEach(distinctUsernames(COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES));
      expect(searchCommits).toHaveBeenCalledTimes(COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES);

      await expect(getCommits("one-too-many")).resolves.toEqual({
        found: false,
        error: "Too many searches at once. Please wait a moment and try again.",
        errorKind: "rate_limit",
        commits: [],
      });
      expect(searchCommits).toHaveBeenCalledTimes(COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES);
    });

    it("logs the refusal without the client address or the searched username", async () => {
      await searchEach(distinctUsernames(COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES));
      await getCommits("one-too-many");

      expect(console.warn).toHaveBeenCalledWith({
        event: "commit_search_rate_limited_client",
        errorKind: "rate_limit",
        limit: COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES,
        windowMs: COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS,
      });
    });

    it("retains an opaque key for the client and nothing about the search", async () => {
      await getCommits("octo");

      const retained = trackedCommitSearchClientKeys();

      expect(retained).toEqual([hashClientIdentifier(CLIENT_ADDRESS)]);
      expect(JSON.stringify(retained)).not.toContain("octo");
      expect(JSON.stringify(retained)).not.toContain(CLIENT_ADDRESS);
    });

    it("bounds each client separately, so one burst cannot refuse another visitor", async () => {
      await searchEach(distinctUsernames(COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES));
      await expect(getCommits("one-too-many")).resolves.toMatchObject({
        errorKind: "rate_limit",
      });

      requestsFromClient("198.51.100.4");

      await expect(getCommits("one-too-many")).resolves.toMatchObject({ found: true });
    });

    it("does not spend a client's allowance on a search the cache answers", async () => {
      const repeatedSearches = COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES + 10;
      for (let index = 0; index < repeatedSearches; index += 1) {
        await expect(getCommits("octo")).resolves.toMatchObject({ found: true });
      }

      expect(searchCommits).toHaveBeenCalledTimes(1);
    });

    it("bounds nothing when the request carries no client address", async () => {
      requestsFromClient(null);

      const results = await searchEach(
        distinctUsernames(COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES + 5),
      );

      expect(results.every((result) => result.found)).toBe(true);
      expect(trackedCommitSearchClientKeys()).toEqual([]);
    });
  });
});
