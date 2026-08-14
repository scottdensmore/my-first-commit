import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommitData } from "../commitTypes";
import SearchErrorState from "./SearchErrorState";

function renderSearchErrorState(result: CommitData) {
  render(
    <SearchErrorState
      result={result}
      exampleUsernames={["octocat"]}
      isPending={false}
      lastSearchedUsername="octo"
      onRetry={() => {}}
      onReset={() => {}}
      onExampleSearch={() => {}}
    />,
  );
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
});
