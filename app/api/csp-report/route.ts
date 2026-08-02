import { logger } from "@/app/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Reports arrive unauthenticated from any browser, so the body is untrusted and unbounded. Anything
// larger than this is not a real violation report.
const MAX_BODY_BYTES = 16_384;

// CSP substitutes a bare keyword for a URL in some violations, so these are not parse failures.
const URL_KEYWORDS = new Set([
  "inline",
  "eval",
  "self",
  "data",
  "blob",
  "wasm-eval",
  "wasm-unsafe-eval",
  "trusted-types-policy",
  "trusted-types-sink",
]);

// Schemes whose body carries the content itself. Report the scheme and drop the payload.
const OPAQUE_PROTOCOLS = new Set(["data:", "blob:", "filesystem:", "javascript:"]);

/**
 * Reduce a reported URL to origin + path.
 *
 * Query strings are dropped because the app puts the searched username in `?user=`, and search
 * usernames must not reach logs. Fragments are dropped for the same reason.
 */
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === "") {
    return null;
  }

  if (URL_KEYWORDS.has(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);

    if (OPAQUE_PROTOCOLS.has(url.protocol)) {
      return url.protocol;
    }

    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

function safeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeString(value: unknown, maxLength = 128): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, maxLength) : null;
}

type ViolationFields = {
  documentUri: string | null;
  blockedUri: string | null;
  effectiveDirective: string | null;
  disposition: string | null;
  statusCode: number | null;
  sourceFile: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
};

/**
 * Normalize the two report shapes browsers send.
 *
 * `report-uri` posts `{"csp-report": {...}}` with hyphenated keys. The Reporting API (`report-to`)
 * posts an array of `{type, body}` with camelCased keys. Both are accepted so reporting keeps
 * working as browsers migrate.
 *
 * `original-policy` and `script-sample` are deliberately never read: the policy is long and already
 * known, and the sample can contain page content or user input.
 */
function normalizeReports(parsed: unknown): ViolationFields[] {
  const records: Record<string, unknown>[] = [];

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (entry && typeof entry === "object") {
        const { type, body } = entry as { type?: unknown; body?: unknown };

        if (type === "csp-violation" && body && typeof body === "object") {
          records.push(body as Record<string, unknown>);
        }
      }
    }
  } else if (parsed && typeof parsed === "object") {
    const legacy = (parsed as Record<string, unknown>)["csp-report"];

    if (legacy && typeof legacy === "object") {
      records.push(legacy as Record<string, unknown>);
    }
  }

  return records.map((record) => ({
    documentUri: safeUrl(record["documentURL"] ?? record["document-uri"]),
    blockedUri: safeUrl(record["blockedURL"] ?? record["blocked-uri"]),
    effectiveDirective: safeString(
      record["effectiveDirective"] ?? record["effective-directive"] ?? record["violated-directive"],
      64,
    ),
    disposition: safeString(record["disposition"], 16),
    statusCode: safeNumber(record["statusCode"] ?? record["status-code"]),
    sourceFile: safeUrl(record["sourceFile"] ?? record["source-file"]),
    lineNumber: safeNumber(record["lineNumber"] ?? record["line-number"]),
    columnNumber: safeNumber(record["columnNumber"] ?? record["column-number"]),
  }));
}

export async function POST(request: Request) {
  let body: string;

  try {
    body = await request.text();
  } catch {
    logger.warn({ event: "csp_report_unreadable" });

    return new Response(null, { status: 204 });
  }

  if (body.length > MAX_BODY_BYTES) {
    logger.warn({ event: "csp_report_too_large", fields: { bytes: body.length } });

    return new Response(null, { status: 413 });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    logger.warn({ event: "csp_report_malformed" });

    return new Response(null, { status: 204 });
  }

  const violations = normalizeReports(parsed);

  if (violations.length === 0) {
    logger.warn({ event: "csp_report_empty" });

    return new Response(null, { status: 204 });
  }

  for (const violation of violations) {
    logger.warn({ event: "csp_violation", fields: { ...violation } });
  }

  // Browsers ignore the response body, and a report is never worth failing a page over.
  return new Response(null, { status: 204 });
}
