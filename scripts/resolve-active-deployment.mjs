// Prints the commit currently live in a deployment environment, or fails saying none is.
//
// The promotion guard used to compare the deployed commit against the tip of `main`, which answers
// a different question. `main` advances at merge; a deployment becomes live later, and may never.
// So a newer commit still deploying -- or one that failed -- made the guard skip the release of the
// commit genuinely in production, and that release was never cut.
//
// Usage:
//   GITHUB_TOKEN=... node scripts/resolve-active-deployment.mjs <owner/repo> <environment>

import { selectActiveDeployment } from "./production-release.mjs";

const [repository, environment] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN?.trim();

if (!repository || !environment) {
  console.error("Usage: node scripts/resolve-active-deployment.mjs <owner/repo> <environment>");
  process.exit(1);
}

if (!token) {
  console.error("GITHUB_TOKEN is required to read deployments.");
  process.exit(1);
}

const api = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GET ${path} returned ${response.status}`);
  }

  return response.json();
};

try {
  // Newest first, which is the order selectActiveDeployment relies on. Twenty is far more than the
  // window between two production deployments; the answer is almost always the first entry.
  const deployments = await api(
    `/repos/${repository}/deployments?environment=${encodeURIComponent(environment)}&per_page=20`,
  );

  const withState = [];

  for (const deployment of deployments) {
    // The deployment record carries no state of its own -- only its statuses do, newest first.
    const statuses = await api(
      `/repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`,
    );

    withState.push({ sha: deployment.sha, state: statuses[0]?.state });
  }

  const activeSha = selectActiveDeployment(withState);

  if (!activeSha) {
    console.error(
      `No successful ${environment} deployment found in the last ${withState.length} records. ` +
        "Refusing to guess which commit is live.",
    );
    process.exit(1);
  }

  console.log(activeSha);
} catch (error) {
  console.error(`Could not resolve the active ${environment} deployment: ${error.message}`);
  process.exit(1);
}
