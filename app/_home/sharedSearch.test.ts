import { afterEach, describe, expect, it } from "vitest";
import type { CommitData, CommitInfo } from "../commitTypes";
import {
  buildResultShareText,
  clearSharedSearchUrl,
  getInitialSharedUsername,
  updateSharedSearchUrl,
} from "./sharedSearch";

const commit: CommitInfo = {
  message: "Initial commit\n\nLonger body that should not appear in the summary",
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

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("getInitialSharedUsername", () => {
  it("reads the user query parameter", () => {
    window.history.replaceState(null, "", "/?user=octocat");
    expect(getInitialSharedUsername()).toBe("octocat");
  });

  it("returns an empty string when the parameter is absent", () => {
    window.history.replaceState(null, "", "/");
    expect(getInitialSharedUsername()).toBe("");
  });
});

describe("updateSharedSearchUrl and clearSharedSearchUrl", () => {
  it("adds and removes the user query parameter", () => {
    updateSharedSearchUrl("torvalds");
    expect(window.location.search).toBe("?user=torvalds");

    clearSharedSearchUrl();
    expect(window.location.search).toBe("");
  });

  it("preserves unrelated query parameters when clearing", () => {
    window.history.replaceState(null, "", "/?ref=hn&user=gaearon");
    clearSharedSearchUrl();
    expect(window.location.search).toBe("?ref=hn");
  });
});

describe("buildResultShareText", () => {
  it("summarizes the first commit using only its subject line", () => {
    const result: CommitData = { found: true, commits: [commit] };
    const text = buildResultShareText("octocat", result);

    expect(text).toContain("octocat's first public commit: Initial commit");
    expect(text).not.toContain("Longer body");
    expect(text).toContain("Repository: octocat/repo");
    expect(text).toContain("Commit: https://github.com/octocat/repo/commit/abc123");
  });

  it("does not call a partial result the first public commit", () => {
    const result: CommitData = { found: true, incomplete: true, commits: [commit] };
    const text = buildResultShareText("octocat", result);

    expect(text).not.toContain("octocat's first public commit:");
    expect(text).toContain("octocat's earliest public commit found so far: Initial commit");
    expect(text).toContain("GitHub search was incomplete, so an earlier commit may exist.");
  });

  it("falls back to a search summary when there are no commits", () => {
    const result: CommitData = { found: false, commits: [] };
    expect(buildResultShareText("octocat", result)).toContain(
      "octocat's first public commit search:",
    );
  });
});
