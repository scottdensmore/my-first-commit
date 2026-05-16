import { describe, expect, it } from "vitest";
import { getUsernameValidationMessage, normalizeGitHubUsername } from "./username";

describe("GitHub username helpers", () => {
  it("normalizes surrounding whitespace", () => {
    expect(normalizeGitHubUsername("  octocat  ")).toBe("octocat");
  });

  it.each([
    ["octocat", ""],
    ["octo-cat", ""],
    ["octo_cat", "Use only letters, numbers, and hyphens."],
    ["-octo", "GitHub usernames cannot start or end with a hyphen."],
    ["octo-", "GitHub usernames cannot start or end with a hyphen."],
    ["octo--cat", "GitHub usernames cannot include consecutive hyphens."],
    ["a".repeat(40), "GitHub usernames must be 39 characters or fewer."],
  ])("validates %s", (username, expectedMessage) => {
    expect(getUsernameValidationMessage(username)).toBe(expectedMessage);
  });
});

