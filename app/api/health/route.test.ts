import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalEnv = process.env;

describe("GET /api/health", () => {
  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns a no-store health payload without secrets", async () => {
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: "secret-token",
      NEXT_PUBLIC_SITE_URL: "https://my-first-commit-eta.vercel.app",
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store, max-age=0");
    expect(body).toMatchObject({
      status: "ok",
      service: "my-first-commit",
      environment: "production",
      commit: "abc123",
      checks: {
        siteUrl: {
          configured: true,
          value: "https://my-first-commit-eta.vercel.app",
        },
      },
    });
    expect(Date.parse(body.timestamp)).not.toBeNaN();
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });

  it("reports missing optional public configuration without failing health", async () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SITE_URL: "",
      VERCEL_ENV: "",
      VERCEL_GIT_COMMIT_SHA: "",
    };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      environment: "local",
      commit: "local",
      checks: {
        siteUrl: {
          configured: false,
          value: null,
        },
      },
    });
  });
});
