import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CommitData } from "../_lib/commitTypes";
import SearchErrorState from "./SearchErrorState";

function renderSearchErrorState(result: CommitData, isPending = false) {
  const onRetry = vi.fn();
  const errorState = (pending: boolean) => (
    <SearchErrorState
      result={result}
      exampleUsernames={["octocat"]}
      isPending={pending}
      lastSearchedUsername="octo"
      onRetry={onRetry}
      onReset={() => {}}
      onExampleSearch={() => {}}
    />
  );
  const view = render(errorState(isPending));

  return {
    onRetry,
    rerender: (nextIsPending: boolean) => view.rerender(errorState(nextIsPending)),
  };
}

describe("SearchErrorState", () => {
  it("suggests other profiles when a finished search found nothing", () => {
    renderSearchErrorState({ found: false, errorKind: "empty", commits: [] });

    expect(screen.getByRole("heading", { name: "No public commits found." })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Check a known public profile" })).toBeVisible();
  });

  it("does not suggest other profiles when the search never finished", () => {
    renderSearchErrorState({ found: false, errorKind: "empty", incomplete: true, commits: [] });

    expect(
      screen.getByRole("heading", { name: "GitHub could not finish this search." }),
    ).toBeInTheDocument();
    // Suggesting a different username implies this one was searched and came up empty.
    expect(
      screen.queryByRole("heading", { name: "Check a known public profile" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("keeps focus on the retry while the retry it started is running", () => {
    const { rerender } = renderSearchErrorState({
      found: false,
      errorKind: "rate_limit",
      commits: [],
    });

    const retryButton = screen.getByRole("button", { name: "Try again" });
    retryButton.focus();

    // The panel stays mounted through the retry, so the button a visitor just pressed is
    // still on screen. Disabling it would blur it to <body> and strand them there for the
    // whole request.
    rerender(true);

    // jsdom does not blur a focused control when it becomes disabled, so `toHaveFocus`
    // states the intent but cannot fail on the regression. `not.toBeDisabled` is the
    // assertion that actually holds the browser behaviour in place.
    expect(retryButton).toHaveFocus();
    expect(retryButton).toHaveAttribute("aria-disabled", "true");
    expect(retryButton).not.toBeDisabled();
    expect(retryButton).toHaveAccessibleName("Searching again...");
  });

  it("refuses a second retry while one is running", async () => {
    const user = userEvent.setup();
    const { onRetry } = renderSearchErrorState(
      { found: false, errorKind: "rate_limit", commits: [] },
      true,
    );

    // aria-disabled is advisory, so the handler has to enforce what the attribute claims.
    await user.click(screen.getByRole("button", { name: "Searching again..." }));

    expect(onRetry).not.toHaveBeenCalled();
  });
});
