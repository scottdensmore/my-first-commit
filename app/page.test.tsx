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
