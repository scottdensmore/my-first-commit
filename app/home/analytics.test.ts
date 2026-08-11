import { track } from "@vercel/analytics";
import { describe, expect, it, vi } from "vitest";
import { redactAnalyticsEvent, trackAppEvent } from "./analytics";

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

describe("redactAnalyticsEvent", () => {
  it.each([
    {
      event: {
        type: "pageview" as const,
        url: "https://example.com/?user=octo%20cat&ref=homepage#results",
      },
      expectedUrl: "https://example.com/?ref=homepage#results",
    },
    {
      event: {
        type: "event" as const,
        url: "https://example.com/search?campaign=launch&user=octo%2Dcat&user=second",
      },
      expectedUrl: "https://example.com/search?campaign=launch",
    },
  ])("removes usernames from $event.type analytics URLs", ({ event, expectedUrl }) => {
    expect(redactAnalyticsEvent(event)).toEqual({
      ...event,
      url: expectedUrl,
    });
    expect(event.url).toContain("user=");
  });
});
