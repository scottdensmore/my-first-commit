import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "./page";
import { getCommits } from "./actions";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  getCommits: vi.fn(),
}));

const mockGetCommits = vi.mocked(getCommits);

const commitResult = {
  found: true,
  commits: [
    {
      message: "Initial commit\n\nAdd the first files",
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
};

describe("Home", () => {
  beforeEach(() => {
    mockGetCommits.mockReset();
  });

  it("focuses the GitHub search field and marks it as a non-credential search box", () => {
    render(<Home />);

    const input = screen.getByRole("searchbox", { name: /github username/i });

    expect(input).toHaveFocus();
    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("name", "commit-search");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
  });

  it("submits a trimmed username and renders returned commits", async () => {
    mockGetCommits.mockResolvedValue(commitResult);
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "  octo  ");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(mockGetCommits).toHaveBeenCalledWith("octo");
    });
    expect(await screen.findByRole("link", { name: "Initial commit" })).toBeInTheDocument();
  });

  it("shows a username format hint before the user types", () => {
    render(<Home />);

    expect(screen.getByText(/github usernames can use letters, numbers, or single hyphens/i)).toBeInTheDocument();
  });

  it("blocks searches for usernames with invalid characters", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "octo_cat");

    expect(screen.getByRole("status")).toHaveTextContent(/only letters, numbers, and hyphens/i);
    expect(screen.getByRole("button", { name: /^search$/i })).toBeDisabled();
    expect(mockGetCommits).not.toHaveBeenCalled();
  });

  it("does not submit invalid usernames from the keyboard", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "octo_cat{Enter}");

    expect(mockGetCommits).not.toHaveBeenCalled();
  });

  it("blocks searches for usernames with leading or trailing hyphens", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "-octo");

    expect(screen.getByRole("status")).toHaveTextContent(/cannot start or end with a hyphen/i);
    expect(screen.getByRole("button", { name: /^search$/i })).toBeDisabled();
  });

  it("blocks searches for usernames longer than GitHub allows", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "a".repeat(40));

    expect(screen.getByRole("status")).toHaveTextContent(/39 characters or fewer/i);
    expect(screen.getByRole("button", { name: /^search$/i })).toBeDisabled();
  });

  it("blocks searches for usernames with consecutive hyphens", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "octo--cat");

    expect(screen.getByRole("status")).toHaveTextContent(/cannot include consecutive hyphens/i);
    expect(screen.getByRole("button", { name: /^search$/i })).toBeDisabled();
  });

  it("announces the search while a request is pending", async () => {
    let resolveSearch: (value: typeof commitResult) => void = () => undefined;
    mockGetCommits.mockReturnValue(new Promise((resolve) => {
      resolveSearch = resolve;
    }));
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "octo");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/searching github for octo/i);
    expect(screen.getByRole("button", { name: /searching/i })).toBeDisabled();

    resolveSearch(commitResult);

    expect(await screen.findByRole("link", { name: "Initial commit" })).toBeInTheDocument();
  });

  it("renders a helpful empty state when no public commits are found", async () => {
    mockGetCommits.mockResolvedValue({
      found: false,
      error: "No public commits found for this user (or indexing is delayed).",
      errorKind: "empty",
      commits: [],
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "new-user");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByRole("heading", { name: /no public commits found/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/no public commits found/i);
    expect(screen.getByText(/try another username or check back later/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit username/i })).toBeInTheDocument();
  });

  it("renders a recovery-focused error state for rate limits", async () => {
    mockGetCommits.mockResolvedValue({
      found: false,
      error: "GitHub rate limit reached. Please try again in a few minutes.",
      errorKind: "rate_limit",
      commits: [],
    });
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "octo");
    await user.click(screen.getByRole("button", { name: /^search$/i }));

    expect(await screen.findByRole("heading", { name: /github is asking us to slow down/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/github is asking us to slow down/i);
    expect(screen.getByText(/wait a few minutes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("retries the username that produced a rate-limit error", async () => {
    mockGetCommits.mockResolvedValue({
      found: false,
      error: "GitHub rate limit reached. Please try again in a few minutes.",
      errorKind: "rate_limit",
      commits: [],
    });
    const user = userEvent.setup();
    render(<Home />);

    const input = screen.getByRole("searchbox", { name: /github username/i });
    await user.type(input, "octo");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await screen.findByRole("heading", { name: /github is asking us to slow down/i });

    await user.clear(input);
    await user.type(input, "someone-else");
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(mockGetCommits).toHaveBeenLastCalledWith("octo");
  });

  it("clears the result and refocuses the search field when searching again", async () => {
    mockGetCommits.mockResolvedValue(commitResult);
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByRole("searchbox", { name: /github username/i }), "octo");
    await user.click(screen.getByRole("button", { name: /^search$/i }));
    await screen.findByRole("button", { name: /search another user/i });

    await user.click(screen.getByRole("button", { name: /search another user/i }));

    const input = screen.getByRole("searchbox", { name: /github username/i });
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");
  });

  it("uses the spaced app name in the header and omits clone branding from the footer", () => {
    render(<Home />);

    expect(screen.getByText("My First Commit")).toBeInTheDocument();
    expect(screen.queryByText(/MyFirstCommit Clone/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Not affiliated with GitHub/i)).toBeInTheDocument();
  });
});
