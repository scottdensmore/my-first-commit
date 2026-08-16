import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSearchClientKey, hashClientIdentifier } from "./searchClientKey";

const { headers } = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers,
}));

function headersReturning(values: Record<string, string>) {
  headers.mockResolvedValue({
    get: (name: string) => values[name] ?? null,
  });
}

beforeEach(() => {
  headers.mockReset();
});

describe("hashClientIdentifier", () => {
  it("returns the same opaque key for the same client and different keys for different ones", () => {
    const key = hashClientIdentifier("203.0.113.7");

    expect(key).toEqual(hashClientIdentifier("203.0.113.7"));
    expect(key).not.toEqual(hashClientIdentifier("203.0.113.8"));
  });

  it("never returns anything the raw address can be read out of", () => {
    const key = hashClientIdentifier("203.0.113.7");

    expect(key).not.toContain("203.0.113.7");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("salts the hash, so a stored key cannot be matched against a precomputed digest", () => {
    expect(hashClientIdentifier("203.0.113.7")).not.toEqual(
      createHash("sha256").update("203.0.113.7").digest("hex"),
    );
  });

  it("uses the first hop of a forwarded list and ignores casing and padding", () => {
    expect(hashClientIdentifier(" 203.0.113.7 , 198.51.100.4 ")).toEqual(
      hashClientIdentifier("203.0.113.7"),
    );
    expect(hashClientIdentifier("2001:DB8::1")).toEqual(hashClientIdentifier("2001:db8::1"));
  });

  it("has no key for a missing or blank value", () => {
    expect(hashClientIdentifier(null)).toBeNull();
    expect(hashClientIdentifier("")).toBeNull();
    expect(hashClientIdentifier("   ,  ")).toBeNull();
  });

  it("still produces a key for an implausibly long value instead of letting it through unlimited", () => {
    expect(hashClientIdentifier("x".repeat(5_000))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("getSearchClientKey", () => {
  it("prefers the header a client cannot overwrite through its own proxy", async () => {
    headersReturning({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-forwarded-for": "198.51.100.4",
    });

    expect(await getSearchClientKey()).toEqual(hashClientIdentifier("203.0.113.7"));
  });

  it("falls back to the standard forwarded header", async () => {
    headersReturning({ "x-forwarded-for": "198.51.100.4" });

    expect(await getSearchClientKey()).toEqual(hashClientIdentifier("198.51.100.4"));
  });

  it("has no key when the request carries no client address", async () => {
    headersReturning({});

    expect(await getSearchClientKey()).toBeNull();
  });

  it("has no key outside a request scope rather than failing the search", async () => {
    headers.mockRejectedValue(new Error("`headers` was called outside a request scope"));

    expect(await getSearchClientKey()).toBeNull();
  });
});
