import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("ErrorPage", () => {
  it("shows a branded recovery screen and lets users retry", async () => {
    const reset = vi.fn();
    const user = userEvent.setup();
    const error = Object.assign(new Error("Unexpected failure"), {
      digest: "abc123",
    });

    render(<ErrorPage error={error} reset={reset} />);

    expect(screen.getByRole("heading", { name: /we lost the commit trail/i })).toBeInTheDocument();
    expect(screen.getByText(/unexpected error/i)).toBeInTheDocument();
    expect(screen.getByText(/error reference: abc123/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go home/i })).toHaveAttribute("href", "/");

    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("does not show an error reference when Next.js does not provide one", () => {
    render(<ErrorPage error={new Error("Unexpected failure")} reset={vi.fn()} />);

    expect(screen.queryByText(/error reference/i)).not.toBeInTheDocument();
  });
});
