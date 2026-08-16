// Validation, reconciliation planning, and reporting for the label sync.
//
// Used by sync-labels.mjs, which is the shell around this: it reads .github/labels.yml, talks to
// GitHub, prints, and exits. Everything that decides *what* happens lives here, as pure functions
// over plain data, so the branch that deletes repository labels can be tested without a token, a
// network, or a process to exit.
//
// Deleting a label removes it from every issue and pull request that carries it, and that cannot be
// undone. So `planLabelSync` is the only thing that ever puts a name in `deleted`, it does that only
// when `prune` is set, and `applyLabelPlan` sends a DELETE for nothing else. A prune-less plan is
// not merely unapplied — it has nothing to apply.

/** The canonical label file, named in problem messages so they point at the file to edit. */
export const LABELS_FILE = ".github/labels.yml";

/** GitHub rejects longer descriptions with a 422 that does not name the offending field. */
export const MAX_DESCRIPTION_LENGTH = 100;

const HEX_COLOR = /^[0-9a-f]{6}$/;

/**
 * Every problem with a parsed label file, as human-readable lines; empty when the file is valid.
 *
 * Returns problems rather than exiting, and reports all of them rather than the first, so one run
 * shows everything that needs fixing.
 */
export function validateLabels(labels, labelsFile = LABELS_FILE) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return [`${labelsFile} must contain a non-empty list of labels.`];
  }

  const problems = [];
  const seen = new Set();

  for (const [index, label] of labels.entries()) {
    const at = `${labelsFile}[${index}]`;

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
      // silently stops being a string — but only for some colors, which is why this is its own
      // message. e10c02 stays a string, so a file can look internally consistent and be half wrong.
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

  return problems;
}

/** The three fields a sync sends, and nothing else the file happens to carry. */
function payload(label) {
  return { name: label.name, color: label.color, description: label.description };
}

/**
 * What reconciling `existing` GitHub labels with the `desired` file would do.
 *
 * `created`, `updated`, and `unchanged` hold the desired label as `{ name, color, description }`,
 * which is exactly what `applyLabelPlan` sends. `extra` and `deleted` hold names, since a label
 * being removed needs nothing else. `extra` is everything on GitHub that the file does not list;
 * `deleted` is the subset that would actually be deleted, so it is empty unless `prune` is set.
 *
 * Names are matched exactly. A label on GitHub differing only in case is a different label here,
 * so it is planned as a create plus an extra rather than as an update — GitHub then rejects the
 * create with a 422 instead of quietly making a second label.
 */
export function planLabelSync({ desired, existing, prune = false }) {
  const existingByName = new Map(existing.map((label) => [label.name, label]));
  const plan = { created: [], updated: [], unchanged: [], deleted: [], extra: [] };

  for (const label of desired) {
    const current = existingByName.get(label.name);

    if (!current) {
      plan.created.push(payload(label));
      continue;
    }

    // GitHub returns the color without a `#` but in whatever case it was created with, and null
    // rather than an empty string for a label with no description.
    const drifted =
      (current.color ?? "").toLowerCase() !== label.color ||
      (current.description ?? "") !== label.description;

    plan[drifted ? "updated" : "unchanged"].push(payload(label));
  }

  const desiredNames = new Set(desired.map((label) => label.name));

  for (const label of existing) {
    if (desiredNames.has(label.name)) continue;

    plan.extra.push(label.name);

    if (prune) plan.deleted.push(label.name);
  }

  return plan;
}

/**
 * The report for a plan, as lines.
 *
 * Dry-run wording is conditional throughout, and the deletion line lists the same names
 * `applyLabelPlan` would send, so a dry run previews the destructive step rather than summarizing
 * it. Without `prune`, extras are still named: silence there would read as "the file matches
 * GitHub" when it does not.
 */
export function formatPlanReport({
  owner,
  repo,
  plan,
  dryRun = false,
  prune = false,
  labelsFile = LABELS_FILE,
}) {
  const tense = (applied, pending) => (dryRun ? pending : applied);
  const list = (names) => names.join(", ") || "none";
  const named = (entries) => list(entries.map((entry) => entry.name));

  const lines = [
    `${owner}/${repo}${dryRun ? " (dry run, nothing changed)" : ""}`,
    `  ${tense("created", "would create")}: ${named(plan.created)}`,
    `  ${tense("updated", "would update")}: ${named(plan.updated)}`,
    `  unchanged: ${plan.unchanged.length}`,
  ];

  if (prune) {
    lines.push(`  ${tense("deleted", "would delete")}: ${list(plan.deleted)}`);
  } else if (plan.extra.length > 0) {
    lines.push(`  not in ${labelsFile} (kept, --prune would delete): ${plan.extra.join(", ")}`);
  }

  return lines;
}

/**
 * Sends a plan to GitHub through `request`, and reports how many calls of each kind it made.
 *
 * `request` has the signature of `octokit.request`, which is all this needs from Octokit. Creates
 * and updates go first so that a prune cannot leave the repository short of a label the file lists
 * if a later call fails. A rejected request stops the run rather than continuing through the plan.
 *
 * `dryRun` sends nothing. The caller normally decides that too; having it here as well means the
 * "a dry run writes nothing" guarantee is a property of this function rather than of its callers.
 */
export async function applyLabelPlan(plan, { owner, repo, request, dryRun = false }) {
  const applied = { created: 0, updated: 0, deleted: 0 };

  if (dryRun) return applied;

  for (const label of plan.created) {
    await request("POST /repos/{owner}/{repo}/labels", { owner, repo, ...payload(label) });
    applied.created += 1;
  }

  for (const label of plan.updated) {
    await request("PATCH /repos/{owner}/{repo}/labels/{name}", {
      owner,
      repo,
      name: label.name,
      new_name: label.name,
      color: label.color,
      description: label.description,
    });
    applied.updated += 1;
  }

  // Only ever the names planLabelSync put here, which is only ever with --prune.
  for (const name of plan.deleted) {
    await request("DELETE /repos/{owner}/{repo}/labels/{name}", { owner, repo, name });
    applied.deleted += 1;
  }

  return applied;
}
