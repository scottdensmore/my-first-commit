// Decides two things the release path used to assume.
//
// Which commit a production health run actually tested. The workflow points Playwright at a
// mutable alias, so a green run proved that *something* healthy was serving that URL, not that the
// commit which triggered the run was serving it. A deployment still in flight, or a failed one
// leaving the previous build live, both produce a pass that means less than it looks like.
//
// And which commit is actually live when a release is promoted. The guard compared the deployed
// commit against the tip of `main`, which is a different question: `main` advances at merge, while
// a deployment becomes live later and may never do so. A newer commit that has not finished
// deploying, or failed to, would suppress the release of the commit genuinely in production.
//
// The functions here are pure and the network lives in the CLI below, following sync-labels.mjs:
// the decisions are testable without a token, and the shell that fetches is thin enough to read.

/**
 * Whether `/api/health` reports the commit a run expected.
 *
 * The payload carries an abbreviated SHA -- `getShortCommit` slices to seven characters -- so this
 * compares by prefix rather than by equality, which would never match a 40-character deployment
 * SHA and would fail every run rather than the wrong ones.
 *
 * A prefix shorter than seven characters is refused rather than accepted loosely: at one or two
 * characters a prefix match means almost nothing, and a health payload reporting something that
 * short is broken in a way worth failing on. `"local"` is refused for the same reason -- it is what
 * the route reports when `VERCEL_GIT_COMMIT_SHA` is unset, so it identifies no deployment at all.
 */
export function deployedCommitMatches(healthCommit, expectedSha) {
  if (typeof healthCommit !== "string" || typeof expectedSha !== "string") return false;

  const reported = healthCommit.trim().toLowerCase();
  const expected = expectedSha.trim().toLowerCase();

  if (reported === "local" || reported.length < 7) return false;
  if (expected.length < reported.length) return false;

  return expected.startsWith(reported);
}

/** Why a health run was rejected, in the terms an operator reading the log needs. */
export function describeCommitMismatch(healthCommit, expectedSha) {
  const reported = typeof healthCommit === "string" ? healthCommit.trim() : "";

  if (reported === "local") {
    return (
      "The deployment reports commit `local`, which means VERCEL_GIT_COMMIT_SHA was not set for " +
      "the build. The health check cannot prove which commit it tested."
    );
  }

  if (reported === "") return "The health payload carried no commit.";

  if (reported.length < 7) {
    return `The health payload reported "${reported}", which is too short to identify a commit.`;
  }

  return (
    `The deployment at this URL is serving ${reported}, but this run expected ` +
    `${expectedSha.slice(0, 7)}. The alias is pointing at a different build -- usually one still ` +
    "deploying, or the previous build left live by a failed deployment."
  );
}

/**
 * The commit currently live in production, or `null` when none can be established.
 *
 * `deployments` is newest-first, as the REST API returns it, each entry carrying the `state` of its
 * most recent status. The live commit is the newest one whose state is `success`: an `in_progress`
 * or `failure` deployment is not serving traffic, and the build before it is still live.
 *
 * Returns `null` rather than guessing when nothing has succeeded. The caller stops there instead of
 * promoting, because "no successful production deployment" is not a state a release should be cut
 * from, and inferring one from `main` is the assumption this replaces.
 */
export function selectActiveDeployment(deployments) {
  if (!Array.isArray(deployments)) return null;

  for (const deployment of deployments) {
    if (deployment?.state === "success" && typeof deployment.sha === "string" && deployment.sha) {
      return deployment.sha;
    }
  }

  return null;
}

/**
 * Whether `targetSha` has been overtaken by a newer production deployment.
 *
 * Superseded means another commit is live now, not merely that `main` moved. Two deployments
 * landing close together still queue two promotions, and the older one is skipped here for the
 * reason it always was: its workflow files no longer match `main`, so pushing its tag is rejected.
 */
export function isSupersededDeployment(activeSha, targetSha) {
  if (typeof activeSha !== "string" || activeSha === "") return false;

  return activeSha.toLowerCase() !== String(targetSha).toLowerCase();
}
