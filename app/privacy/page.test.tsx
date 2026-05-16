import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import PrivacyPage, { metadata } from "./page";

describe("PrivacyPage", () => {
  it("documents search, local storage, analytics, and token handling", () => {
    render(<PrivacyPage />);

    expect(screen.getByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to search/i })).toHaveAttribute("href", "/");
    expect(screen.getByText(/sent to GitHub/i)).toBeInTheDocument();
    expect(screen.getByText(/my-first-commit:recent-searches/i)).toBeInTheDocument();
    expect(screen.getByText(/analytics events do not include the searched GitHub username/i)).toBeInTheDocument();
    expect(screen.getByText(/never sent to the browser/i)).toBeInTheDocument();
  });

  it("defines privacy metadata", () => {
    expect(metadata).toMatchObject({
      title: "Privacy",
      description: "How My First Commit handles GitHub usernames, local recent searches, analytics, and server-side tokens.",
      alternates: {
        canonical: "/privacy",
      },
    });
  });
});
