import { findLocalServerProblem } from "../../scripts/e2e-server-identity.mjs";

/**
 * Fails the run when the local port holds a different application.
 *
 * Playwright starts its web server before this hook, and its readiness check only asks whether the
 * port answers. A foreign server answers, so the suite would otherwise proceed against the wrong
 * app and report every spec as a branch failure. Running after that check still converts a wall of
 * misleading failures into one accurate error, which is the point.
 *
 * The decision itself lives in `scripts/` so the unit suite can reach it; `vitest.config.ts`
 * excludes `tests/e2e/**`.
 */
export default async function globalSetup() {
  const problem = await findLocalServerProblem();
  if (problem) throw new Error(problem);
}
