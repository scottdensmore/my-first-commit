// Decides whether a server already listening on the Playwright port is this application.
//
// Playwright's `reuseExistingServer` only checks that the port answers, not what answers. A
// different app left running on the same port is therefore adopted silently, and the whole suite
// runs against it: every selector misses, and the failure reads as a broken branch rather than as
// the wrong server. That has happened repeatedly here with an unrelated app on 3100.
//
// The check is identity, not liveness: `/api/health` reports a `service` name, so a one-request
// probe distinguishes "our app" from "something else" from "nothing listening".

export const HEALTH_PATH = "/api/health";
export const DEFAULT_PORT = 3100;
export const LOOPBACK_HOST = "127.0.0.1";
export const DEFAULT_WORKERS = 4;
// GitHub's ubuntu-latest has 4 vCPU, so Playwright's machine-derived default was 2 there. Holding
// CI at that value keeps this change about determinism rather than quietly doubling the load on a
// single dev server that compiles routes on demand.
export const DEFAULT_CI_WORKERS = 2;
const MAX_WORKERS = 64;
export const SERVICE_NAME = "my-first-commit";
// Generous because this request is often the first one `/api/health` has ever seen in a freshly
// started dev server, which compiles the route on demand. A short budget would abort the suite and
// blame an innocent process for a slow first compile. Nothing listening still fails immediately,
// since a refused connection does not wait for the timeout.
const PROBE_TIMEOUT_MS = 15_000;
// `fetch` rejects with a TypeError carrying the reason on `cause.code`. Only these mean nothing is
// listening; every other transport failure means something is there that could not be identified,
// which is the case that must not be waved through.
const NOTHING_LISTENING_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "EAI_AGAIN"]);
export const MAX_REPORTED_SERVICE_LENGTH = 80;
// The body of a server that has not been identified yet. Loopback moves a lot of bytes inside the
// probe window, so cap what is buffered rather than trusting a stranger to be brief.
const MAX_HEALTH_BODY_BYTES = 1_000_000;

/**
 * The address the local Playwright run uses, so the config and the identity probe cannot
 * disagree about it. Loopback rather than every interface: the server runs with fixture mocks
 * enabled and has no business being reachable from the network.
 *
 * Throws on an unusable `E2E_PORT` instead of falling back, which would run against the default
 * port while the operator believed the override had taken effect.
 */
export function resolveLocalBaseUrl(env = process.env) {
  const configured = env.E2E_PORT;
  if (configured === undefined || configured === "") {
    return `http://${LOOPBACK_HOST}:${DEFAULT_PORT}`;
  }

  const port = Number(configured);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`E2E_PORT must be an integer between 1 and 65535, received "${configured}".`);
  }

  return `http://${LOOPBACK_HOST}:${port}`;
}

/**
 * Fixed by default rather than derived from the machine, so a run behaves the same on a laptop,
 * in CI, and in an agent sandbox.
 *
 * Validates for the same reason `resolveLocalBaseUrl` does, and more urgently: Playwright accepts
 * a NaN worker count and then hangs with no output, which is worse than any error message.
 */
export function resolveWorkerCount(env = process.env) {
  const configured = env.E2E_WORKERS;
  if (configured === undefined || configured === "") {
    return env.CI ? DEFAULT_CI_WORKERS : DEFAULT_WORKERS;
  }

  const workers = Number(configured);
  if (!Number.isInteger(workers) || workers < 1 || workers > MAX_WORKERS) {
    throw new Error(
      `E2E_WORKERS must be an integer between 1 and ${MAX_WORKERS}, received "${configured}".`,
    );
  }

  return workers;
}

/**
 * Which server the suite targets. Kept here so the choice is unit tested rather than living as an
 * expression in `playwright.config.ts`, which no test imports.
 *
 * Truthiness, not `??`: an unset CI variable arrives as an empty string, and selecting it would
 * give an empty base URL while the local server was still started and probed. `E2E_PORT` is
 * resolved only for a local run, so a stale value cannot fail a deployed one.
 */
export function resolveTargets(env = process.env) {
  const deployedBaseUrl = env.PLAYWRIGHT_BASE_URL || null;
  const localBaseUrl = deployedBaseUrl ? null : resolveLocalBaseUrl(env);

  return { deployedBaseUrl, localBaseUrl, baseUrl: localBaseUrl ?? deployedBaseUrl };
}

/**
 * The whole preflight decision, kept here rather than in the Playwright global setup so it is
 * reachable by the unit suite -- `vitest.config.ts` excludes `tests/e2e/**`.
 *
 * A deployed target is skipped: that server is not ours to police, and the suite already switches
 * to deployed-mode expectations for it.
 */
export async function findLocalServerProblem(env = process.env, fetchImpl = fetch) {
  if (env.PLAYWRIGHT_BASE_URL) return null;

  return findForeignServer(resolveLocalBaseUrl(env), fetchImpl);
}

function remedies(port) {
  return (
    `Stop whatever is using port ${port} and run the suite again, or point this run at a free ` +
    `port with E2E_PORT=<port>. The process is left alone on purpose: the port may belong to ` +
    `another checkout, a colleague, or another agent's session.`
  );
}

function isProbeTimeout(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

function timedOutProblem(port) {
  return (
    `Port ${port} is in use by a server that accepted the connection but did not respond to ` +
    `${HEALTH_PATH} in time, so it could not be confirmed as this application. ${remedies(port)}`
  );
}

function portOf(baseUrl) {
  try {
    return new URL(baseUrl).port || "80";
  } catch {
    return "unknown";
  }
}

/**
 * Resolves to a human-readable problem description when a server that is not this application is
 * listening at `baseUrl`, or `null` when the port is free or holds this application.
 *
 * A connection error resolves to `null` on purpose: nothing is listening, so there is nothing to
 * mistake for this app and Playwright is free to start its own server.
 */
export async function findForeignServer(baseUrl, fetchImpl = fetch) {
  const port = portOf(baseUrl);
  let response;

  try {
    response = await fetchImpl(`${baseUrl}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    if (isProbeTimeout(error)) return timedOutProblem(port);

    // Only a code meaning "nothing is listening" is safe to wave through. Anything else -- a
    // listener that accepts and resets, or speaks something other than HTTP -- is a server that
    // Playwright's readiness check may already have adopted.
    const code = error?.cause?.code ?? error?.code;
    if (NOTHING_LISTENING_CODES.has(code)) return null;

    return (
      `Port ${port} is in use by a server whose ${HEALTH_PATH} request failed (${code ?? "unknown transport error"}), ` +
      `so it could not be confirmed as this application. ${remedies(port)}`
    );
  }

  if (!response.ok) {
    // Deliberately not "is not this application": a 5xx can come from this app's own route
    // throwing, and the probe cannot tell that from a stranger.
    return (
      `Port ${port} is in use by a server that did not serve ${HEALTH_PATH} ` +
      `(HTTP ${response.status}), so it could not be confirmed as this application. ` +
      `${remedies(port)}`
    );
  }

  const declaredLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (declaredLength > MAX_HEALTH_BODY_BYTES) {
    return (
      `Port ${port} is in use by a server whose ${HEALTH_PATH} response is ${declaredLength} ` +
      `bytes, far larger than this app's, so it could not be confirmed as this application. ` +
      `${remedies(port)}`
    );
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    // Headers can arrive quickly and the body stall; the abort still fires, and that is a
    // silent server rather than a malformed one.
    if (isProbeTimeout(error)) return timedOutProblem(port);

    return (
      `Port ${port} is in use by a server whose ${HEALTH_PATH} response is not JSON, so it ` +
      `could not be confirmed as this application. ${remedies(port)}`
    );
  }

  if (payload?.service === SERVICE_NAME) return null;

  const found =
    typeof payload?.service === "string"
      ? // Foreign content reaching a terminal and a CI log: strip control characters and cap the
        // length so a hostile or merely verbose name cannot spray escapes into either.
        `"${payload.service.replace(/[^\x20-\x7E]/g, "").slice(0, MAX_REPORTED_SERVICE_LENGTH)}"`
      : "an unknown service";

  return (
    `Port ${port} is in use by ${found}, not ${SERVICE_NAME}. Running here would test the wrong ` +
    `application. ${remedies(port)}`
  );
}
