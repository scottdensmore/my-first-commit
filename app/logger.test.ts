import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the reserved event name when fields contain an event key", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logger.warn({
      event: "github_commit_search_rate_limited",
      fields: {
        event: "overridden",
        status: 403,
      },
    });

    expect(console.warn).toHaveBeenCalledWith({
      event: "github_commit_search_rate_limited",
      status: 403,
    });
  });
});
