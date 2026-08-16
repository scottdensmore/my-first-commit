import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

// Identifying a client for rate limiting means holding something about it in memory, in an app
// whose whole promise is that it stores nothing about a search server-side. So it holds the
// least it can: a salted hash of the forwarded address, never the address, never anything
// about what was searched, and never for longer than the limiter's window.
//
// The salt is random per process and never persisted, so the stored keys survive nothing and
// mean nothing outside the instance that made them. It is not a secret from an attacker who
// can already read this process's memory -- a dump would contain both -- but it does stop a
// stored key from being matched against a precomputed digest of an address, and it stops keys
// from being correlated between instances or across a restart.
const CLIENT_KEY_SALT = randomBytes(32);

// A forwarded header is client-controllable input in the general case. Truncating rather than
// rejecting an implausibly long value matters: rejecting would hand anyone who can set the
// header an unlimited lane by making it absurd. No real client address is anywhere near this.
const MAX_CLIENT_IDENTIFIER_LENGTH = 100;

/**
 * Reduces a forwarded address to the opaque key the limiter counts, or `null` when the request
 * carries nothing usable.
 */
export function hashClientIdentifier(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  // A forwarded list is "client, proxy, proxy"; the client is the first hop. Lower-cased so a
  // re-cased IPv6 address is the same client rather than a second allowance.
  const clientIdentifier = value
    .split(",")[0]
    .trim()
    .toLowerCase()
    .slice(0, MAX_CLIENT_IDENTIFIER_LENGTH);
  if (!clientIdentifier) return null;

  return createHash("sha256").update(CLIENT_KEY_SALT).update(clientIdentifier).digest("hex");
}

/**
 * The current request's client key, or `null` when there is no request scope or no forwarded
 * address to derive one from.
 *
 * `x-vercel-forwarded-for` is preferred because Vercel sets it itself and, unlike
 * `x-forwarded-for`, it is not the header a proxy in front of Vercel can overwrite. Vercel
 * overwrites `x-forwarded-for` with the connecting address specifically so it cannot be
 * spoofed, so on the deployed app neither header is attacker-controlled; the preference is
 * what keeps that true if the app is ever put behind another proxy.
 *
 * `null` means unlimited, which is the right way for this to fail. There is no request-scoped
 * fallback that identifies a client, and bucketing every unidentified request together would
 * be the global counter this deliberately is not -- one shared allowance that ordinary
 * visitors would exhaust between them. The cache and the in-flight map still apply.
 */
export async function getSearchClientKey(): Promise<string | null> {
  try {
    const requestHeaders = await headers();

    return (
      hashClientIdentifier(requestHeaders.get("x-vercel-forwarded-for")) ??
      hashClientIdentifier(requestHeaders.get("x-forwarded-for"))
    );
  } catch {
    // `headers()` throws outside a request scope. A search must not fail because of that.
    return null;
  }
}
