import { logger } from "@/app/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Reports arrive unauthenticated from any browser, so the body is untrusted and unbounded. Anything
// larger than this is not a real violation report. The limit counts bytes rather than JavaScript
// characters, because a multibyte body is several times larger on the wire than its string length.
const MAX_BODY_BYTES = 16_384;

// A Reporting API request carries an array, and each entry would otherwise become its own log
// record, so one POST could amplify into as many log lines as fit in the body limit. Ten is far
// more than a browser batches for one page load; anything beyond it is counted, not logged.
const MAX_REPORTS_PER_REQUEST = 10;

// `report-uri` posts `application/csp-report` and the Reporting API posts `application/reports+json`.
// Nothing else is a violation report, so nothing else is read.
const ACCEPTED_CONTENT_TYPES = new Set(["application/csp-report", "application/reports+json"]);

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

// The only schemes whose path is a location rather than content. Everything else — `data:` and
// `blob:` payloads, `javascript:` source, `mailto:` addresses, an app-specific scheme registered by
// an extension or a native app — carries its content after the colon, so only the scheme is kept.
const PATH_BEARING_PROTOCOLS = new Set(["http:", "https:"]);

/**
 * Reduce a reported URL to origin + path, or to the bare scheme when the scheme is not http(s).
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

    if (!PATH_BEARING_PROTOCOLS.has(url.protocol)) {
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
 * Collect the violation records from the two report shapes browsers send.
 *
 * `report-uri` posts `{"csp-report": {...}}` with hyphenated keys. The Reporting API (`report-to`)
 * posts an array of `{type, body}` with camelCased keys. Both are accepted so reporting keeps
 * working as browsers migrate.
 */
function collectReportRecords(parsed: unknown): Record<string, unknown>[] {
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

  return records;
}

/**
 * Reduce one report record to the fields that are safe to log.
 *
 * `original-policy` and `script-sample` are deliberately never read: the policy is long and already
 * known, and the sample can contain page content or user input.
 */
function toViolationFields(record: Record<string, unknown>): ViolationFields {
  return {
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
  };
}

/** Content types carry parameters such as `; charset=utf-8`, and their case is not significant. */
function isAcceptedContentType(header: string | null): boolean {
  if (header === null) {
    return false;
  }

  const [mediaType = ""] = header.split(";");

  return ACCEPTED_CONTENT_TYPES.has(mediaType.trim().toLowerCase());
}

type BoundedBody =
  | { status: "ok"; body: string }
  | { status: "too-large"; bytes: number }
  | { status: "unreadable" };

/**
 * Read the body only as far as the limit allows.
 *
 * Reading the whole body and then measuring it would mean buffering whatever an anonymous caller
 * chose to send. `Content-Length` rejects an oversized body before a byte is read, and because that
 * header can be absent or simply untrue, the stream is also counted as it arrives and cancelled the
 * moment the limit is passed.
 */
async function readBoundedBody(request: Request): Promise<BoundedBody> {
  const declaredLength = request.headers.get("content-length");

  if (declaredLength !== null) {
    const declared = Number(declaredLength);

    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      return { status: "too-large", bytes: declared };
    }
  }

  if (request.body === null) {
    return { status: "ok", body: "" };
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let body = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      received += value.byteLength;

      if (received > MAX_BODY_BYTES) {
        // The body is already over the limit, so a sender that refuses to be cancelled changes
        // nothing about the answer.
        await reader.cancel().catch(() => {});

        return { status: "too-large", bytes: received };
      }

      body += decoder.decode(value, { stream: true });
    }

    return { status: "ok", body: body + decoder.decode() };
  } catch {
    return { status: "unreadable" };
  }
}

export async function POST(request: Request) {
  if (!isAcceptedContentType(request.headers.get("content-type"))) {
    logger.warn({ event: "csp_report_unsupported_type" });

    return new Response(null, { status: 415 });
  }

  const read = await readBoundedBody(request);

  if (read.status === "too-large") {
    logger.warn({
      event: "csp_report_too_large",
      fields: { bytes: read.bytes, limit: MAX_BODY_BYTES },
    });

    return new Response(null, { status: 413 });
  }

  if (read.status === "unreadable") {
    logger.warn({ event: "csp_report_unreadable" });

    return new Response(null, { status: 204 });
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(read.body);
  } catch {
    logger.warn({ event: "csp_report_malformed" });

    return new Response(null, { status: 204 });
  }

  const records = collectReportRecords(parsed);

  if (records.length === 0) {
    logger.warn({ event: "csp_report_empty" });

    return new Response(null, { status: 204 });
  }

  const logged = records.slice(0, MAX_REPORTS_PER_REQUEST);

  for (const record of logged) {
    logger.warn({ event: "csp_violation", fields: { ...toViolationFields(record) } });
  }

  if (records.length > logged.length) {
    logger.warn({
      event: "csp_report_truncated",
      fields: { received: records.length, logged: logged.length },
    });
  }

  // Browsers ignore the response body, and a report is never worth failing a page over.
  return new Response(null, { status: 204 });
}
