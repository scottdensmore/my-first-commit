import { track } from "@vercel/analytics";
import { describe, expect, it, vi } from "vitest";
import { trackAppEvent } from "./analytics";

vi.mock("@vercel/analytics", () => ({
  track: vi.fn(),
}));

describe("trackAppEvent", () => {
  it("swallows analytics failures so optional tracking cannot break the UI", () => {
    vi.mocked(track).mockImplementation(() => {
      throw new Error("analytics unavailable");
    });

    expect(() => trackAppEvent("search_submitted")).not.toThrow();
  });
});
