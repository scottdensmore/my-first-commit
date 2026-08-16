import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { logger } from "@/app/_lib/logger";
import { POST } from "./route";

const ENDPOINT = "https://my-first-commit-eta.vercel.app/api/csp-report";

function postReport(body: unknown, contentType = "application/csp-report") {
  return POST(
    new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

/**
 * Post a body the route has to pull chunk by chunk, so a test can observe how much of it was read.
 *
 * `pulledChunks` counts what the stream was asked for, which is what proves the route stopped early
 * rather than buffering the whole body and measuring it afterwards.
 */
function postStreamedReport(
  chunks: Uint8Array[],
  { contentLength }: { contentLength?: string } = {},
) {
  let pulled = 0;
  let next = 0;

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (next >= chunks.length) {
        controller.close();
        return;
      }

      pulled += 1;
      controller.enqueue(chunks[next]);
      next += 1;
    },
  });

  const headers = new Headers({ "content-type": "application/csp-report" });

  if (contentLength !== undefined) {
    headers.set("content-length", contentLength);
  }

  const request = new Request(ENDPOINT, {
    method: "POST",
    headers,
    body,
    // Required by undici for a streamed request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return { request, response: POST(request), pulledChunks: () => pulled };
}

function violationCalls(warn: MockInstance<typeof logger.warn>) {
  return warn.mock.calls
    .map(([logEvent]) => logEvent)
    .filter((logEvent) => logEvent.event === "csp_violation");
}

describe("POST /api/csp-report", () => {
  let warn: MockInstance<typeof logger.warn>;

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

  it("reduces every non-HTTP scheme to the scheme alone", async () => {
    await postReport({
      "csp-report": {
        "document-uri": "https://my-first-commit-eta.vercel.app/",
        "effective-directive": "form-action",
        "blocked-uri": "mailto:security@example.com?subject=do-not-log-me",
        "source-file": "my-app://open/do-not-log-me/token-abc123",
      },
    });

    const [violation] = violationCalls(warn);

    expect(violation.fields?.blockedUri).toBe("mailto:");
    expect(violation.fields?.sourceFile).toBe("my-app:");

    const serialized = JSON.stringify(violation);

    expect(serialized).not.toContain("do-not-log-me");
    expect(serialized).not.toContain("security@example.com");
    expect(serialized).not.toContain("token-abc123");
  });

  it("measures the body in bytes, not JavaScript characters", async () => {
    // 6,000 characters, three bytes each: under the limit by string length, well over it by bytes.
    const response = await postReport("€".repeat(6_000));

    expect(response.status).toBe(413);
    expect(violationCalls(warn)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "csp_report_too_large" }) as never,
    );
  });

  it("rejects a declared oversized body without reading it", async () => {
    const { request, response } = postStreamedReport([new Uint8Array(32_768)], {
      contentLength: "32768",
    });

    expect((await response).status).toBe(413);
    // Never consumed: the declared length was enough to refuse it. Reading first would set this.
    expect(request.bodyUsed).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "csp_report_too_large" }) as never,
    );
  });

  it("stops reading once the limit is passed when Content-Length lies", async () => {
    const chunks = Array.from({ length: 16 }, () => new Uint8Array(4_096));
    const { response, pulledChunks } = postStreamedReport(chunks, { contentLength: "42" });

    expect((await response).status).toBe(413);
    // The route aborted mid-body; a read-then-measure implementation pulls all sixteen.
    expect(pulledChunks()).toBeLessThan(chunks.length);
    expect(violationCalls(warn)).toHaveLength(0);
  });

  it("logs at most ten reports per request and counts the rest", async () => {
    const response = await postReport(
      Array.from({ length: 25 }, (_unused, index) => ({
        type: "csp-violation",
        body: {
          documentURL: `https://my-first-commit-eta.vercel.app/page-${index}`,
          effectiveDirective: "img-src",
          blockedURL: "https://tracker.example/pixel.gif",
        },
      })),
      "application/reports+json",
    );

    expect(response.status).toBe(204);
    expect(violationCalls(warn)).toHaveLength(10);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "csp_report_truncated",
        fields: { received: 25, logged: 10 },
      }) as never,
    );
  });

  it("rejects content types that are not CSP report types", async () => {
    const report = {
      "csp-report": {
        "document-uri": "https://my-first-commit-eta.vercel.app/",
        "effective-directive": "img-src",
        "blocked-uri": "https://tracker.example/pixel.gif",
      },
    };

    for (const contentType of ["application/json", "text/plain;charset=UTF-8", ""]) {
      const response = await postReport(report, contentType);

      expect(response.status).toBe(415);
    }

    expect(violationCalls(warn)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "csp_report_unsupported_type" }) as never,
    );
  });

  it("accepts the expected content types with parameters", async () => {
    const response = await postReport(
      {
        "csp-report": {
          "document-uri": "https://my-first-commit-eta.vercel.app/",
          "effective-directive": "img-src",
          "blocked-uri": "https://tracker.example/pixel.gif",
        },
      },
      "Application/CSP-Report; charset=utf-8",
    );

    expect(response.status).toBe(204);
    expect(violationCalls(warn)).toHaveLength(1);
  });

  it("absorbs malformed and unrecognized payloads", async () => {
    const malformed = await postReport("{not json");

    expect(malformed.status).toBe(204);

    const unrecognized = await postReport({ unexpected: true });

    expect(unrecognized.status).toBe(204);
    expect(violationCalls(warn)).toHaveLength(0);
  });
});
