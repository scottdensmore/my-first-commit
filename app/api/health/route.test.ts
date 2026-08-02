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
        githubToken: {
          configured: true,
        },
      },
    });
    expect(body.runtime).toBeUndefined();
    expect(Date.parse(body.timestamp)).not.toBeNaN();
    expect(JSON.stringify(body)).not.toContain("secret-token");
    // The token check must report presence and nothing else. A value, prefix, length, or hash on a
    // public endpoint would leak more than "it is set".
    expect(Object.keys(body.checks.githubToken)).toEqual(["configured"]);
  });

  it("reports a missing GitHub token without failing health", async () => {
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: "",
      NEXT_PUBLIC_SITE_URL: "https://my-first-commit-eta.vercel.app",
    };

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: {
        githubToken: {
          configured: false,
        },
      },
    });
  });

  it("treats a whitespace-only GitHub token as missing", async () => {
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: "   ",
    };

    const response = await GET();
    const body = await response.json();

    expect(body.checks.githubToken.configured).toBe(false);
  });

  it("reports missing optional public configuration without failing health", async () => {
    process.env = {
      ...originalEnv,
      GITHUB_TOKEN: "",
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
