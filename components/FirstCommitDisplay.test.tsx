import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FirstCommitDisplay from "./FirstCommitDisplay";
import type { CommitInfo } from "../app/actions";

const commit: CommitInfo = {
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
};

describe("FirstCommitDisplay", () => {
  it("renders the repository, commit, author, avatar, and details", () => {
    render(<FirstCommitDisplay data={commit} />);

    const ownerLinks = screen.getAllByRole("link", { name: "octo" });
    expect(ownerLinks).toHaveLength(2);
    expect(ownerLinks[0]).toHaveAttribute("href", "https://github.com/octo");
    expect(ownerLinks[1]).toHaveAttribute("href", "https://github.com/octo");
    expect(screen.getByRole("link", { name: "repo" })).toHaveAttribute("href", "https://github.com/octo/repo");
    expect(screen.getByRole("link", { name: "Initial commit" })).toHaveAttribute("href", commit.html_url);
    expect(screen.getByRole("link", { name: "abcdef1" })).toHaveAttribute("href", commit.html_url);
    expect(screen.getByText("Add the first files")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "octo" })).toHaveAttribute("src", expect.stringContaining("octo.png"));
    expect(screen.getByRole("link", { name: /view full commit on github/i })).toHaveAttribute("href", commit.html_url);
  });

  it("uses a narrower layout for secondary commits", () => {
    const { container } = render(<FirstCommitDisplay data={commit} isMain={false} />);

    expect(container.firstElementChild).toHaveClass("max-w-xl");
  });
});
