#!/usr/bin/env node
// Reconciles GitHub labels with .github/labels.yml, the canonical label set.
//
// Deleting a label removes it from every issue and pull request that carries it, and that cannot be
// undone. Pruning is therefore opt-in, never the default. Dependabot also creates its own labels
// (`javascript`, `github_actions`) without asking, so anything it owns must be listed in the file
// before pruning is safe.
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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const LABELS_FILE = ".github/labels.yml";
const HEX_COLOR = /^[0-9a-f]{6}$/;
// GitHub rejects longer descriptions with a 422 that does not name the offending field.
const MAX_DESCRIPTION_LENGTH = 100;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function validate(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    fail(`${LABELS_FILE} must contain a non-empty list of labels.`);
  }

  const problems = [];
  const seen = new Set();

  for (const [index, label] of labels.entries()) {
    const at = `${LABELS_FILE}[${index}]`;

    if (!label || typeof label !== "object") {
      problems.push(`${at}: expected a mapping with name, color, and description.`);
      continue;
    }

    const { name, color, description } = label;

    if (typeof name !== "string" || name.trim() === "") {
      problems.push(`${at}: name is required.`);
    } else if (seen.has(name)) {
      problems.push(`${at}: duplicate label name "${name}".`);
    } else {
      seen.add(name);
    }

    if (typeof color === "number") {
      // YAML reads 5319e7 as scientific notation and 000000 as an integer, so an unquoted color
      // silently stops being a string. Colors must be quoted in the file.
      problems.push(
        `${at} (${name}): color parsed as the number ${color}. Quote it, for example color: "5319e7".`,
      );
    } else if (typeof color !== "string" || !HEX_COLOR.test(color)) {
      problems.push(`${at} (${name}): color must be six lowercase hex digits without "#".`);
    }

    if (typeof description !== "string" || description.trim() === "") {
      problems.push(`${at} (${name}): description is required.`);
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      problems.push(
        `${at} (${name}): description is ${description.length} characters, over GitHub's ${MAX_DESCRIPTION_LENGTH}.`,
      );
    }
  }

  if (problems.length > 0) {
    fail(`${LABELS_FILE} is invalid:\n${problems.map((line) => `  - ${line}`).join("\n")}`);
  }
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

  validate(desired);

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
  const existingByName = new Map(existing.map((label) => [label.name, label]));

  const planned = { created: [], updated: [], deleted: [], unchanged: [] };

  for (const label of desired) {
    const current = existingByName.get(label.name);

    if (!current) {
      planned.created.push(label.name);

      if (!dryRun) {
        await octokit.request("POST /repos/{owner}/{repo}/labels", { owner, repo, ...label });
      }

      continue;
    }

    // GitHub returns null rather than an empty string for a label with no description.
    const drifted =
      current.color.toLowerCase() !== label.color ||
      (current.description ?? "") !== label.description;

    if (!drifted) {
      planned.unchanged.push(label.name);
      continue;
    }

    planned.updated.push(label.name);

    if (!dryRun) {
      await octokit.request("PATCH /repos/{owner}/{repo}/labels/{name}", {
        owner,
        repo,
        name: label.name,
        new_name: label.name,
        color: label.color,
        description: label.description,
      });
    }
  }

  const desiredNames = new Set(desired.map((label) => label.name));
  const extra = existing.map((label) => label.name).filter((name) => !desiredNames.has(name));

  for (const name of extra) {
    if (!prune) {
      continue;
    }

    planned.deleted.push(name);

    if (!dryRun) {
      await octokit.request("DELETE /repos/{owner}/{repo}/labels/{name}", { owner, repo, name });
    }
  }

  const tense = (applied, pending) => (dryRun ? pending : applied);

  console.log(`${owner}/${repo}${dryRun ? " (dry run, nothing changed)" : ""}`);
  console.log(`  ${tense("created", "would create")}: ${planned.created.join(", ") || "none"}`);
  console.log(`  ${tense("updated", "would update")}: ${planned.updated.join(", ") || "none"}`);
  console.log(`  unchanged: ${planned.unchanged.length}`);

  if (prune) {
    console.log(`  ${tense("deleted", "would delete")}: ${planned.deleted.join(", ") || "none"}`);
  } else if (extra.length > 0) {
    // Silence here would read as "the file matches GitHub" when it does not.
    console.log(`  not in ${LABELS_FILE} (kept, --prune would delete): ${extra.join(", ")}`);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
