import { render } from "@testing-library/react";
import { Analytics } from "@vercel/analytics/next";
import { describe, expect, it, vi } from "vitest";
import { redactAnalyticsEvent } from "./home/analytics";
import PrivacySafeAnalytics from "./PrivacySafeAnalytics";

vi.mock("@vercel/analytics/next", () => ({
  Analytics: vi.fn(() => null),
}));

describe("PrivacySafeAnalytics", () => {
  it("registers URL redaction for every Vercel Analytics event", () => {
    render(<PrivacySafeAnalytics />);

    expect(vi.mocked(Analytics).mock.calls[0]?.[0]).toEqual({
      beforeSend: redactAnalyticsEvent,
    });
  });
});
