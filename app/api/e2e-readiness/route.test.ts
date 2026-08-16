import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, buildReadinessPayload } from "./route";

describe("GET /api/e2e-readiness", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports the fixture mocks as enabled when the suite started the server", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_COMMIT_SEARCH_MOCKS", "1");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(body).toEqual({ service: "my-first-commit", commitSearchMocks: true });
  });

  it("reports the fixture mocks as disabled when they were never set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_COMMIT_SEARCH_MOCKS", undefined);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commitSearchMocks).toBe(false);
  });

  it("reports the same flag value the server action reads, not merely a truthy one", async () => {
    // `app/actions.ts` serves fixtures only for exactly "1". Anything looser here would report a
    // ready server that then hits real GitHub for every reserved username.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_COMMIT_SEARCH_MOCKS", "true");

    expect(buildReadinessPayload(process.env).commitSearchMocks).toBe(false);
  });

  it("does not exist in a production build", async () => {
    // The reason this route carries the flag instead of /api/health: on any built and deployed
    // server the probe is absent rather than merely uninteresting.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_COMMIT_SEARCH_MOCKS", "1");

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
  });

  it("reports nothing beyond the service name and the one flag", async () => {
    // This route answers one question. Every field added here is a field a dev server hands to
    // anything that can reach it.
    expect(Object.keys(buildReadinessPayload({ E2E_COMMIT_SEARCH_MOCKS: "1" }))).toEqual([
      "service",
      "commitSearchMocks",
    ]);
  });
});
