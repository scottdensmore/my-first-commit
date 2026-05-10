import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound, { metadata } from "./not-found";

describe("NotFound", () => {
  it("shows a branded 404 page with a path back home", () => {
    render(<NotFound />);

    expect(metadata.title).toBe("Page not found");
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /this commit path does not exist/i })).toBeInTheDocument();
    expect(screen.getByText(/link may have been copied incorrectly/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute("href", "/");
  });
});
