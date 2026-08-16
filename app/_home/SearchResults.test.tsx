import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommitInfo } from "../_lib/commitTypes";
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

type Overrides = {
  isIncomplete?: boolean;
  commits?: CommitInfo[];
  lastSearchedUsername?: string;
  retry?: Partial<Parameters<typeof SearchResults>[0]["retry"]>;
};

function renderSearchResults({
  isIncomplete = false,
  commits: initialCommits = commits,
  lastSearchedUsername = "octo",
  retry = {},
}: Overrides = {}) {
  const onRetry = vi.fn();
  const element = (overrides: Overrides = {}) => (
    <SearchResults
      commits={overrides.commits ?? initialCommits}
      lastSearchedUsername={overrides.lastSearchedUsername ?? lastSearchedUsername}
      shareStatus=""
      isIncomplete={overrides.isIncomplete ?? isIncomplete}
      retry={{
        isRetrying: false,
        error: "",
        stillPartial: false,
        onRetry,
        ...retry,
        ...overrides.retry,
      }}
      onCopy={() => {}}
    />
  );
  const { rerender } = render(element());

  return { onRetry, rerender: (overrides: Overrides) => rerender(element(overrides)) };
}

describe("SearchResults", () => {
  it("presents a complete result as the first public commit, with no retry", () => {
    renderSearchResults();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "First public commit found",
    );
    expect(screen.queryByRole("button", { name: "Search again" })).not.toBeInTheDocument();
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

  it("retries the same username", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderSearchResults({ isIncomplete: true });

    await user.click(screen.getByRole("button", { name: "Search again" }));

    expect(onRetry).toHaveBeenCalledWith("octo");
  });

  it("keeps a live region mounted while idle, so a later announcement is not missed", () => {
    renderSearchResults({ isIncomplete: true });

    // A region inserted together with its text is commonly not announced at all.
    const status = screen.getByRole("status");
    expect(status).toBeInTheDocument();
    expect(status).toBeEmptyDOMElement();
  });

  it("reports progress and refuses a second retry while one is running", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderSearchResults({ isIncomplete: true, retry: { isRetrying: true } });

    const retryButton = screen.getByRole("button", { name: "Searching again..." });

    // aria-disabled keeps the pressed control focusable; a disabled button blurs itself.
    expect(retryButton).toHaveAttribute("aria-disabled", "true");
    expect(retryButton).not.toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/searching github again for octo/i);

    await user.click(retryButton);

    expect(onRetry).not.toHaveBeenCalled();
  });

  it("shows a retry that finished but is still partial, not only to a screen reader", () => {
    renderSearchResults({ isIncomplete: true, retry: { stillPartial: true } });

    // Nothing else on screen changes in this case, so silence reads as a broken button.
    expect(screen.getByRole("status")).toHaveTextContent(/still returned a partial result/i);
    // toBeVisible passes for sr-only text, which is clipped rather than hidden.
    expect(screen.getByText(/still returned a partial result/i)).not.toHaveClass("sr-only");
  });

  it("keeps focus on the retry button when a retry comes back partial again", async () => {
    const user = userEvent.setup();
    const { rerender } = renderSearchResults({ isIncomplete: true });

    await user.click(screen.getByRole("button", { name: "Search again" }));
    const retryButton = screen.getByRole("button", { name: "Search again" });
    retryButton.focus();

    // A still-partial retry returns a fresh object for the same commit; focusing the
    // heading on that identity change would throw the visitor back to the top of the
    // result and drown the one announcement explaining what happened.
    rerender({
      isIncomplete: true,
      commits: commits.map((commit) => ({ ...commit })),
      retry: { stillPartial: true },
    });

    expect(retryButton).toHaveFocus();
  });

  it("moves focus to the heading when a retry reaches the complete history", () => {
    const { rerender } = renderSearchResults({ isIncomplete: true });

    // Focus must start somewhere else, or this passes on the focus the mount effect set.
    screen.getByRole("button", { name: "Search again" }).focus();

    // The retry button unmounts with the panel, so without this the visitor is dropped
    // at the top of the document with nothing announcing the outcome they asked for.
    rerender({ isIncomplete: false, commits: commits.map((commit) => ({ ...commit })) });

    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("moves focus to the heading when the same commit is shown for a different username", () => {
    const { rerender } = renderSearchResults({ isIncomplete: true });

    screen.getByRole("button", { name: "Search again" }).focus();

    // Two people can share an earliest commit, so the sha alone does not prove the
    // result is unchanged.
    rerender({ isIncomplete: true, lastSearchedUsername: "torvalds" });

    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
  });

  it("explains a failed retry without disturbing the commits already on screen", () => {
    renderSearchResults({
      isIncomplete: true,
      retry: { error: "GitHub is rate limiting searches right now." },
    });

    expect(screen.getByRole("status")).toHaveTextContent(/rate limiting/i);
    expect(screen.getByText(/still the earlier partial result/i)).not.toHaveClass("sr-only");
    expect(screen.getByRole("link", { name: "Initial commit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search again" })).toBeInTheDocument();
  });

  it("renders a failed retry after the button, so the button does not move under the pointer", () => {
    renderSearchResults({
      isIncomplete: true,
      retry: { error: "GitHub is rate limiting searches right now." },
    });

    const retryButton = screen.getByRole("button", { name: "Search again" });
    const failure = screen.getByText(/still the earlier partial result/i);

    expect(
      retryButton.compareDocumentPosition(failure) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("adds a failed retry to the heading description, for a visitor who returns to it", () => {
    renderSearchResults({
      isIncomplete: true,
      retry: { error: "GitHub is rate limiting searches right now." },
    });

    const describedBy = screen.getByRole("heading", { level: 1 }).getAttribute("aria-describedby");
    const described = describedBy!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");

    expect(described).toMatch(/earlier commit may be missing/i);
    expect(described).toMatch(/rate limiting/i);
  });
});
