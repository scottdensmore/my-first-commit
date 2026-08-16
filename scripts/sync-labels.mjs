#!/usr/bin/env node
// Reconciles GitHub labels with .github/labels.yml, the canonical label set.
//
// Deleting a label removes it from every issue and pull request that carries it, and that cannot be
// undone. Pruning is therefore opt-in, never the default. Dependabot also creates its own labels
// (`javascript`, `github_actions`) without asking, so anything it owns must be listed in the file
// before pruning is safe.
//
// This is the shell only: arguments, file reading, the token and repository, the Octokit calls, the
// printing, and the exit code. Validation, planning, reporting, and applying live in label-plan.mjs
// as pure functions, where they are unit tested without a token or a network — including the prune
// branch, which is the one that deletes things.
//
// Usage:
//   node scripts/sync-labels.mjs --check      validate the file offline, no network, no token
//   node scripts/sync-labels.mjs --dry-run    report what would change
//   node scripts/sync-labels.mjs              create and update labels
//   node scripts/sync-labels.mjs --prune      also delete labels missing from the file

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";

import {
  LABELS_FILE,
  applyLabelPlan,
  formatPlanReport,
  planLabelSync,
  validateLabels,
} from "./label-plan.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  console.error(message);
  process.exit(1);
}

function resolveRepo() {
  const fromEnv = process.env.GITHUB_REPOSITORY?.trim();

  if (fromEnv) {
    const [owner, repo] = fromEnv.split("/");

    if (owner && repo) {
      return { owner, repo };
    }
  }

  fail("Set GITHUB_REPOSITORY to <owner>/<repo>.");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const dryRun = args.has("--dry-run");
  const prune = args.has("--prune");

  const raw = await readFile(join(repoRoot, LABELS_FILE), "utf8");
  const desired = load(raw);
  const problems = validateLabels(desired);

  if (problems.length > 0) {
    fail(`${LABELS_FILE} is invalid:\n${problems.map((line) => `  - ${line}`).join("\n")}`);
  }

  if (check) {
    console.log(`${LABELS_FILE} is valid (${desired.length} labels).`);
    return;
  }

  const token = process.env.GITHUB_TOKEN?.trim();

  if (!token) {
    fail("Set GITHUB_TOKEN to a token with permission to manage labels.");
  }

  const { owner, repo } = resolveRepo();
  const { Octokit } = await import("octokit");
  const octokit = new Octokit({ auth: token });

  const existing = await octokit.paginate("GET /repos/{owner}/{repo}/labels", {
    owner,
    repo,
    per_page: 100,
  });

  const plan = planLabelSync({ desired, existing, prune });

  await applyLabelPlan(plan, {
    owner,
    repo,
    dryRun,
    request: (route, parameters) => octokit.request(route, parameters),
  });

  for (const line of formatPlanReport({ owner, repo, plan, dryRun, prune })) {
    console.log(line);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
