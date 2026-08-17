/**
 * Whether the commit search serves browser fixtures instead of querying GitHub.
 *
 * One definition, read by two callers: `app/_lib/actions.ts`, which decides what a search returns,
 * and `app/api/e2e-readiness/route.ts`, which tells the Playwright preflight what this server will
 * do. A second copy of the comparison could drift -- accepting `"true"` in one place and only `"1"`
 * in the other -- and the failure mode is a server that reports itself ready and then sends every
 * reserved `e2e-*` username to real GitHub, which is exactly what the preflight exists to catch.
 *
 * `app/_lib/actions.ts` is a `"use server"` module, so it cannot export a synchronous predicate
 * itself.
 */
/**
 * An index signature rather than the one named key, so `process.env` satisfies it and a test can
 * still pass a bare object literal. A type listing only optional named properties is a weak type
 * that `NodeJS.ProcessEnv` does not satisfy.
 */
export type EnvLike = Record<string, string | undefined>;

export function commitSearchMocksEnabled(env: EnvLike = process.env) {
  return env.E2E_COMMIT_SEARCH_MOCKS === "1";
}
