import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommitInfo } from "../commitTypes";
import SearchResults from "./SearchResults";

const commits: CommitInfo[] = [
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
];

function renderSearchResults(overrides: Partial<Parameters<typeof SearchResults>[0]> = {}) {
  render(
    <SearchResults
      commits={commits}
      lastSearchedUsername="octo"
      shareStatus=""
      isIncomplete={false}
      onCopy={() => {}}
      {...overrides}
    />,
  );
}

describe("SearchResults", () => {
  it("presents a complete result as the first public commit", () => {
    renderSearchResults();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "First public commit found",
    );
  });

  it("does not claim a partial result is the first commit", () => {
    renderSearchResults({ isIncomplete: true });

    expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(
      "First public commit found",
    );
    expect(
      screen.getByRole("region", { name: "GitHub returned a partial result" }),
    ).toHaveTextContent(/earlier commit may be missing/i);
  });

  it("describes the heading with the partial-result caveat, so taking focus announces it", () => {
    renderSearchResults({ isIncomplete: true });

    const heading = screen.getByRole("heading", { level: 1 });
    const descriptionId = heading.getAttribute("aria-describedby");

    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)).toHaveTextContent(
      /earlier commit may be missing/i,
    );
  });

  it("leaves the heading undescribed for a complete result", () => {
    renderSearchResults();

    expect(screen.getByRole("heading", { level: 1 })).not.toHaveAttribute("aria-describedby");
  });
});
