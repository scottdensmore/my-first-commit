// Proves which commit a production health run is about to test.
//
// The run points Playwright at a mutable alias, so without this a green suite means "something
// healthy was serving that URL", not "the commit that triggered this run was serving it". A
// deployment still in flight, or a failed one leaving the previous build live, both pass.
//
// Runs before the suite rather than after, so a run against the wrong build stops in seconds with
// one accurate error instead of producing a wall of results that describe the wrong code -- the
// same reason the Playwright global setup checks the port before any spec runs.
//
// Usage:
//   node scripts/verify-deployed-commit.mjs <baseUrl> <expectedSha>

import { deployedCommitMatches, describeCommitMismatch } from "./production-release.mjs";

const [baseUrl, expectedSha] = process.argv.slice(2);

if (!baseUrl || !expectedSha) {
  console.error("Usage: node scripts/verify-deployed-commit.mjs <baseUrl> <expectedSha>");
  process.exit(1);
}

const healthUrl = new URL("/api/health", baseUrl).toString();
let payload;

try {
  const response = await fetch(healthUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(`${healthUrl} returned ${response.status}, so the deployed commit is unknown.`);
    process.exit(1);
  }

  payload = await response.json();
} catch (error) {
  console.error(`Could not reach ${healthUrl}: ${error.message}`);
  process.exit(1);
}

if (deployedCommitMatches(payload?.commit, expectedSha)) {
  console.log(`${baseUrl} is serving ${payload.commit}, which is the commit this run expects.`);
  process.exit(0);
}

console.error(describeCommitMismatch(payload?.commit, expectedSha));
console.error(
  "Not failing the deployment -- failing this check, because a pass here would claim the new " +
    "commit is healthy on evidence gathered from a different one.",
);
process.exit(1);
