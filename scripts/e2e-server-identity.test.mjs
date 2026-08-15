import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PORT,
  DEFAULT_WORKERS,
  HEALTH_PATH,
  MAX_REPORTED_SERVICE_LENGTH,
  SERVICE_NAME,
  findForeignServer,
  findLocalServerProblem,
  resolveLocalBaseUrl,
  resolveTargets,
  resolveWorkerCount,
} from "./e2e-server-identity.mjs";

const baseUrl = "http://127.0.0.1:3100";

function fetchReturning(response) {
  return vi.fn(async () => response);
}

function jsonResponse(payload, ok = true) {
  return { ok, status: ok ? 200 : 404, headers: { get: () => null }, json: async () => payload };
}

describe("findForeignServer", () => {
  it("accepts a server that identifies itself as this app", async () => {
    const fetchImpl = fetchReturning(jsonResponse({ status: "ok", service: SERVICE_NAME }));

    await expect(findForeignServer(baseUrl, fetchImpl)).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith(`${baseUrl}${HEALTH_PATH}`, expect.any(Object));
  });

  it("reports a different application holding the port", async () => {
    const fetchImpl = fetchReturning(jsonResponse({ service: "contoso-outdoors" }));

    const problem = await findForeignServer(baseUrl, fetchImpl);

    expect(problem).toMatch(/contoso-outdoors/);
    expect(problem).toMatch(/3100/);
  });

  it("reports a server with no health endpoint, which is not this app either", async () => {
    const fetchImpl = fetchReturning(jsonResponse({ message: "Not Found" }, false));

    const problem = await findForeignServer(baseUrl, fetchImpl);

    expect(problem).toMatch(/404/);
    expect(problem).toMatch(/3100/);
    // A 5xx can come from our own route throwing, so the message reports what was observed
    // rather than asserting an identity it cannot know.
    expect(problem).not.toMatch(/is not this application/i);
    expect(problem).toMatch(/could not be confirmed/i);
  });

  it("reports a server whose health endpoint is not JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    }));

    await expect(findForeignServer(baseUrl, fetchImpl)).resolves.toMatch(/3100/);
  });

  it("names the remedies, since the run cannot proceed without one of them", async () => {
    const fetchImpl = fetchReturning(jsonResponse({ service: "contoso-outdoors" }));

    const problem = await findForeignServer(baseUrl, fetchImpl);

    expect(problem).toMatch(/E2E_PORT/);
    // Never suggest killing it: the port may belong to a colleague's or another agent's work.
    expect(problem).not.toMatch(/\bkill\b/i);
  });
});

describe("resolveLocalBaseUrl", () => {
  it("defaults to the documented port", () => {
    expect(resolveLocalBaseUrl({})).toBe(`http://127.0.0.1:${DEFAULT_PORT}`);
  });

  it("honours E2E_PORT, so a busy default does not block a run", () => {
    expect(resolveLocalBaseUrl({ E2E_PORT: "4100" })).toBe("http://127.0.0.1:4100");
  });

  it("rejects a port that is not a usable number rather than silently falling back", () => {
    // Falling back would run against the default port while the operator believes otherwise.
    expect(() => resolveLocalBaseUrl({ E2E_PORT: "not-a-port" })).toThrow(/E2E_PORT/);
    expect(() => resolveLocalBaseUrl({ E2E_PORT: "0" })).toThrow(/E2E_PORT/);
    expect(() => resolveLocalBaseUrl({ E2E_PORT: "70000" })).toThrow(/E2E_PORT/);
  });

  it("binds the loopback interface, not every interface", () => {
    // The mocked-fixture server must not be reachable from the network.
    expect(resolveLocalBaseUrl({})).toContain("127.0.0.1");
  });
});

describe("resolveWorkerCount", () => {
  it("defaults to a fixed count rather than the machine's CPU count", () => {
    expect(resolveWorkerCount({})).toBe(DEFAULT_WORKERS);
  });

  it("honours E2E_WORKERS", () => {
    expect(resolveWorkerCount({ E2E_WORKERS: "2" })).toBe(2);
  });

  it("rejects a value that is not a usable worker count", () => {
    // Playwright accepts NaN and then hangs forever with no output, which is a worse
    // failure than any error message.
    expect(() => resolveWorkerCount({ E2E_WORKERS: "not-a-number" })).toThrow(/E2E_WORKERS/);
    expect(() => resolveWorkerCount({ E2E_WORKERS: "0" })).toThrow(/E2E_WORKERS/);
    expect(() => resolveWorkerCount({ E2E_WORKERS: "-1" })).toThrow(/E2E_WORKERS/);
    expect(() => resolveWorkerCount({ E2E_WORKERS: "1.5" })).toThrow(/E2E_WORKERS/);
  });

  it("rejects a count large enough to be a mistake rather than launching that many browsers", () => {
    expect(() => resolveWorkerCount({ E2E_WORKERS: "999" })).toThrow(/E2E_WORKERS/);
  });

  it("holds CI at its previous effective concurrency", () => {
    // ubuntu-latest has 4 vCPU, so Playwright's default was 2. Pinning 4 there would double
    // the load on a single on-demand-compiling dev server, which nothing in this change measured.
    expect(resolveWorkerCount({ CI: "true" })).toBe(2);
    expect(resolveWorkerCount({ CI: "true", E2E_WORKERS: "3" })).toBe(3);
  });
});

describe("the identity constant", () => {
  it("matches what the app actually serves", async () => {
    const { buildHealthPayload } = await import("../app/api/health/route.ts");

    // Two copies of this literal exist. Renaming the one in the route without this test would
    // make every local run fail against its own freshly started server.
    expect(buildHealthPayload().service).toBe(SERVICE_NAME);
  });
});

describe("foreign content in the error message", () => {
  it("truncates and strips a hostile service name", async () => {
    const fetchImpl = fetchReturning(
      jsonResponse({ service: `bad\u001b[31m\nname${"x".repeat(200)}` }),
    );

    const problem = await findForeignServer(baseUrl, fetchImpl);
    const reported = problem.match(/"([^"]*)"/)[1];

    expect(reported).toHaveLength(MAX_REPORTED_SERVICE_LENGTH);
    expect(reported).not.toMatch(/[^\x20-\x7E]/);
  });

  it("reports an oversized body instead of buffering it", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "50000000" },
      json: async () => {
        throw new Error("should not parse a body this large");
      },
    }));

    await expect(findForeignServer(baseUrl, fetchImpl)).resolves.toMatch(/50000000 bytes/);
  });

  it("reports a stalled body as silence rather than as malformed JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => {
        throw Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
      },
    }));

    // Headers can arrive fast and the body stall; curl would show a hang, not bad JSON.
    await expect(findForeignServer(baseUrl, fetchImpl)).resolves.toMatch(/did not respond/i);
  });
});

describe("findLocalServerProblem", () => {
  it("skips the check for a deployed target, which is not ours to police", async () => {
    const fetchImpl = vi.fn();

    await expect(
      findLocalServerProblem({ PLAYWRIGHT_BASE_URL: "https://example.com" }, fetchImpl),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("checks the local server otherwise", async () => {
    const fetchImpl = fetchReturning(jsonResponse({ service: "contoso-outdoors" }));

    await expect(findLocalServerProblem({}, fetchImpl)).resolves.toMatch(/contoso-outdoors/);
    expect(fetchImpl).toHaveBeenCalledWith(
      `http://127.0.0.1:${DEFAULT_PORT}${HEALTH_PATH}`,
      expect.any(Object),
    );
  });
});

// `fetch` rejects with a TypeError carrying the real reason on `cause.code`; it never puts a
// `code` on the error itself. Fabricating that shape produces tests that pass whatever the
// implementation does.
function transportFailure(code) {
  return Object.assign(new TypeError("fetch failed"), { cause: { code } });
}

describe("findForeignServer transport failures", () => {
  it.each(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "EAI_AGAIN"])(
    "treats %s as a free port, so Playwright can start its own server",
    async (code) => {
      const fetchImpl = vi.fn(async () => {
        throw transportFailure(code);
      });

      await expect(findForeignServer(baseUrl, fetchImpl)).resolves.toBeNull();
    },
  );

  it("reports a listener that accepts the connection and then drops it", async () => {
    const fetchImpl = vi.fn(async () => {
      throw transportFailure("UND_ERR_SOCKET");
    });

    // This is the silent-adoption case: a server answering / but resetting on /api/health
    // is adopted by Playwright's readiness check, so calling it a free port runs the whole
    // suite against the wrong app.
    await expect(findForeignServer(baseUrl, fetchImpl)).resolves.toMatch(/could not be confirmed/i);
  });

  it("reports a server that accepts the connection but never answers", async () => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error("The operation was aborted"), { name: "TimeoutError" });
    });

    await expect(findForeignServer(baseUrl, fetchImpl)).resolves.toMatch(/did not respond/i);
  });

  it("describes a port it cannot parse rather than throwing", async () => {
    const fetchImpl = fetchReturning(jsonResponse({ service: "contoso-outdoors" }));

    await expect(findForeignServer("not-a-url", fetchImpl)).resolves.toMatch(/unknown/);
  });
});

describe("resolveTargets", () => {
  it("runs locally when no deployed target is set", () => {
    const targets = resolveTargets({});

    expect(targets.localBaseUrl).toBe(`http://127.0.0.1:${DEFAULT_PORT}`);
    expect(targets.baseUrl).toBe(targets.localBaseUrl);
    expect(targets.deployedBaseUrl).toBeNull();
  });

  it("runs against a deployed target when one is set", () => {
    const targets = resolveTargets({ PLAYWRIGHT_BASE_URL: "https://example.com" });

    expect(targets.baseUrl).toBe("https://example.com");
    expect(targets.localBaseUrl).toBeNull();
  });

  it("treats an empty deployed target as unset", () => {
    // An unset CI variable arrives as "". Selecting it would give an empty base URL while
    // still starting and probing the local server, so every navigation would fail.
    const targets = resolveTargets({ PLAYWRIGHT_BASE_URL: "" });

    expect(targets.baseUrl).toBe(`http://127.0.0.1:${DEFAULT_PORT}`);
    expect(targets.localBaseUrl).toBe(targets.baseUrl);
    // Normalised, not merely ignored: the empty string must not survive into the returned
    // contract, or a consumer reading deployedBaseUrl would see a target that does not exist.
    expect(targets.deployedBaseUrl).toBeNull();
  });

  it("does not validate E2E_PORT for a deployed run that never uses it", () => {
    expect(() =>
      resolveTargets({ PLAYWRIGHT_BASE_URL: "https://example.com", E2E_PORT: "nonsense" }),
    ).not.toThrow();
  });
});
