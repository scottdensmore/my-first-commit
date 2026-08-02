import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/app/logger";
import { POST } from "./route";

function postReport(body: unknown, contentType = "application/csp-report") {
  return POST(
    new Request("https://my-first-commit-eta.vercel.app/api/csp-report", {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function violationCalls(warn: ReturnType<typeof vi.spyOn>) {
  return warn.mock.calls
    .map(([logEvent]) => logEvent as { event: string; fields?: Record<string, unknown> })
    .filter((logEvent) => logEvent.event === "csp_violation");
}

describe("POST /api/csp-report", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records a report-uri violation with sanitized fields", async () => {
    const response = await postReport({
      "csp-report": {
        "document-uri": "https://my-first-commit-eta.vercel.app/",
        "violated-directive": "script-src-elem",
        "effective-directive": "script-src-elem",
        "blocked-uri": "https://evil.example/x.js",
        disposition: "report",
        "status-code": 200,
        "source-file": "https://my-first-commit-eta.vercel.app/app.js",
        "line-number": 12,
        "column-number": 5,
      },
    });

    expect(response.status).toBe(204);

    const [violation] = violationCalls(warn);

    expect(violation.fields).toEqual({
      documentUri: "https://my-first-commit-eta.vercel.app/",
      blockedUri: "https://evil.example/x.js",
      effectiveDirective: "script-src-elem",
      disposition: "report",
      statusCode: 200,
      sourceFile: "https://my-first-commit-eta.vercel.app/app.js",
      lineNumber: 12,
      columnNumber: 5,
    });
  });

  it("records Reporting API violations and ignores other report types", async () => {
    const response = await postReport(
      [
        {
          type: "deprecation",
          body: { id: "unrelated" },
        },
        {
          type: "csp-violation",
          body: {
            documentURL: "https://my-first-commit-eta.vercel.app/privacy",
            effectiveDirective: "img-src",
            blockedURL: "https://tracker.example/pixel.gif",
            disposition: "report",
          },
        },
      ],
      "application/reports+json",
    );

    expect(response.status).toBe(204);

    const violations = violationCalls(warn);

    expect(violations).toHaveLength(1);
    expect(violations[0].fields).toMatchObject({
      documentUri: "https://my-first-commit-eta.vercel.app/privacy",
      blockedUri: "https://tracker.example/pixel.gif",
      effectiveDirective: "img-src",
    });
  });

  it("strips the query string so searched usernames never reach logs", async () => {
    await postReport({
      "csp-report": {
        "document-uri": "https://my-first-commit-eta.vercel.app/?user=octocat#results",
        referrer: "https://my-first-commit-eta.vercel.app/?user=octocat",
        "effective-directive": "style-src",
        "blocked-uri": "https://cdn.example/style.css?token=abc123",
      },
    });

    const [violation] = violationCalls(warn);

    expect(violation.fields?.documentUri).toBe("https://my-first-commit-eta.vercel.app/");
    expect(violation.fields?.blockedUri).toBe("https://cdn.example/style.css");

    const serialized = JSON.stringify(violation);

    expect(serialized).not.toContain("octocat");
    expect(serialized).not.toContain("abc123");
    expect(serialized).not.toContain("referrer");
  });

  it("reduces opaque schemes to the scheme and keeps CSP keywords", async () => {
    await postReport({
      "csp-report": {
        "document-uri": "https://my-first-commit-eta.vercel.app/",
        "effective-directive": "script-src",
        "blocked-uri": "data:text/html,<script>alert(document.cookie)</script>",
      },
    });
    await postReport({
      "csp-report": {
        "document-uri": "https://my-first-commit-eta.vercel.app/",
        "effective-directive": "script-src",
        "blocked-uri": "inline",
      },
    });

    const violations = violationCalls(warn);

    expect(violations[0].fields?.blockedUri).toBe("data:");
    expect(JSON.stringify(violations[0])).not.toContain("alert");
    expect(violations[1].fields?.blockedUri).toBe("inline");
  });

  it("never logs the original policy or the script sample", async () => {
    await postReport({
      "csp-report": {
        "document-uri": "https://my-first-commit-eta.vercel.app/",
        "effective-directive": "script-src",
        "blocked-uri": "inline",
        "original-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'",
        "script-sample": "const secret = 'do-not-log-me'",
      },
    });

    const serialized = JSON.stringify(violationCalls(warn));

    expect(serialized).not.toContain("do-not-log-me");
    expect(serialized).not.toContain("original-policy");
    expect(serialized).not.toContain("originalPolicy");
    expect(serialized).not.toContain("unsafe-inline");
  });

  it("rejects an oversized body without parsing it", async () => {
    const response = await postReport("x".repeat(16_385));

    expect(response.status).toBe(413);
    expect(violationCalls(warn)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "csp_report_too_large" }) as never,
    );
  });

  it("absorbs malformed and unrecognized payloads", async () => {
    const malformed = await postReport("{not json");

    expect(malformed.status).toBe(204);

    const unrecognized = await postReport({ unexpected: true });

    expect(unrecognized.status).toBe(204);
    expect(violationCalls(warn)).toHaveLength(0);
  });
});
