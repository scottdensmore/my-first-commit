import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCommits } from "./actions";

const { searchCommits } = vi.hoisted(() => ({
  searchCommits: vi.fn(),
}));

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
    searchCommits.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a validation error when username is missing", async () => {
    await expect(getCommits("")).resolves.toEqual({
      found: false,
      error: "Username is required",
      commits: [],
    });
    expect(searchCommits).not.toHaveBeenCalled();
  });

  it("queries GitHub for the earliest commits by author", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [commitItem],
      },
    });

    await getCommits("octo");

    expect(searchCommits).toHaveBeenCalledWith({
      q: "author:octo",
      sort: "committer-date",
      order: "asc",
      per_page: 10,
    });
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
          date: "2024-01-01T00:00:00Z",
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

  it("returns a friendly empty state when no indexed commits are found", async () => {
    searchCommits.mockResolvedValue({
      data: {
        items: [],
      },
    });

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "No public commits found for this user (or indexing is delayed).",
      commits: [],
    });
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
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_rate_limited",
      status: 403,
      message: "API rate limit exceeded for user.",
      rateLimitRemaining: "0",
      rateLimitReset: "1710000000",
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
      commits: [],
    });
    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_rate_limited",
      status: 429,
      message: "Too many requests",
      rateLimitRemaining: undefined,
      rateLimitReset: undefined,
    });
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
      commits: [],
    });
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith({
      event: "github_commit_search_failed",
      status: 403,
      message: "Resource not accessible by integration",
    }, error);
  });

  it("returns a validation message for GitHub 422 errors", async () => {
    const error = { status: 422 };
    searchCommits.mockRejectedValue(error);

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "Validation failed. User might not exist.",
      commits: [],
    });
    expect(console.error).toHaveBeenCalledWith({
      event: "github_commit_search_failed",
      status: 422,
      message: undefined,
    }, error);
  });

  it("returns a generic message for unknown GitHub errors", async () => {
    const error = new Error("GitHub is unavailable");
    searchCommits.mockRejectedValue(error);

    await expect(getCommits("octo")).resolves.toEqual({
      found: false,
      error: "Failed to fetch commits.",
      commits: [],
    });
    expect(console.error).toHaveBeenCalledWith({
      event: "github_commit_search_failed",
      status: undefined,
      message: "GitHub is unavailable",
    }, error);
  });
});
