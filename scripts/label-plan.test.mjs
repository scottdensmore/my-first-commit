import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

import {
  MAX_DESCRIPTION_LENGTH,
  applyLabelPlan,
  formatPlanReport,
  planLabelSync,
  validateLabels,
} from "./label-plan.mjs";

const label = (overrides = {}) => ({
  name: "bug",
  color: "d73a4a",
  description: "Something is broken.",
  ...overrides,
});

describe("validateLabels", () => {
  it("accepts a valid label list", () => {
    expect(validateLabels([label(), label({ name: "feature", color: "0e8a16" })])).toEqual([]);
  });

  it("rejects a list that is not an array", () => {
    expect(validateLabels({ bug: "d73a4a" })).toEqual([
      ".github/labels.yml must contain a non-empty list of labels.",
    ]);
  });

  it("rejects an empty list", () => {
    expect(validateLabels([])).toEqual([
      ".github/labels.yml must contain a non-empty list of labels.",
    ]);
  });

  it("names the file it was given", () => {
    expect(validateLabels([], "fixtures/labels.yml")[0]).toContain("fixtures/labels.yml");
  });

  it("rejects an entry that is not a mapping", () => {
    expect(validateLabels(["bug"])).toEqual([
      ".github/labels.yml[0]: expected a mapping with name, color, and description.",
    ]);
  });

  it("rejects a missing or blank name", () => {
    expect(validateLabels([label({ name: undefined })])[0]).toContain("name is required");
    expect(validateLabels([label({ name: "   " })])[0]).toContain("name is required");
  });

  it("rejects a duplicate name", () => {
    const problems = validateLabels([label(), label({ color: "0e8a16" })]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('duplicate label name "bug"');
    expect(problems[0]).toContain("[1]");
  });

  it("does not report a second blank name as a duplicate of the first", () => {
    const problems = validateLabels([label({ name: "" }), label({ name: "" })]);

    expect(problems.every((problem) => !problem.includes("duplicate"))).toBe(true);
  });

  // The asymmetry this validator exists for: whether an unquoted color survives YAML as a string
  // depends on the digits in it, so the file looks internally consistent while half of it is wrong.
  it("agrees with js-yaml about which unquoted colors stop being strings", () => {
    const parsed = load(
      [
        "- { name: numeric, color: 123456, description: d }",
        "- { name: scientific, color: 5319e7, description: d }",
        "- { name: zeros, color: 000000, description: d }",
        "- { name: hex, color: e10c02, description: d }",
        '- { name: quoted, color: "123456", description: d }',
      ].join("\n"),
    );

    expect(parsed.map((entry) => typeof entry.color)).toEqual([
      "number",
      "number",
      "number",
      "string",
      "string",
    ]);
    // 5319e7 is not a colour at all once YAML is done with it, and 000000 is the integer zero.
    expect(parsed[1].color).toBe(53190000000);
    expect(parsed[2].color).toBe(0);

    const problems = validateLabels(parsed);

    expect(problems).toHaveLength(3);
    expect(problems[0]).toContain("color parsed as the number 123456");
    expect(problems[0]).toContain('Quote it, for example color: "5319e7".');
    expect(problems[1]).toContain("color parsed as the number 53190000000");
    expect(problems[2]).toContain("color parsed as the number 0");
  });

  it("names the label whose color parsed as a number", () => {
    expect(validateLabels([label({ color: 123456 })])[0]).toContain("(bug)");
  });

  it.each([
    ["uppercase", "D73A4A"],
    ["a leading #", "#d73a4a"],
    ["three digits", "d74"],
    ["seven digits", "d73a4a0"],
    ["a non-hex letter", "z73a4a"],
    ["surrounding whitespace", " d73a4a "],
  ])("rejects a color with %s", (_case, color) => {
    expect(validateLabels([label({ color })])[0]).toContain("six lowercase hex digits");
  });

  it("rejects a missing color", () => {
    expect(validateLabels([label({ color: undefined })])[0]).toContain("six lowercase hex digits");
  });

  it("rejects a missing or blank description", () => {
    expect(validateLabels([label({ description: undefined })])[0]).toContain(
      "description is required",
    );
    expect(validateLabels([label({ description: "  " })])[0]).toContain("description is required");
  });

  it("accepts a description of exactly the maximum length", () => {
    expect(validateLabels([label({ description: "d".repeat(MAX_DESCRIPTION_LENGTH) })])).toEqual(
      [],
    );
  });

  it("rejects a description one character over the maximum", () => {
    const problems = validateLabels([
      label({ description: "d".repeat(MAX_DESCRIPTION_LENGTH + 1) }),
    ]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain(`is ${MAX_DESCRIPTION_LENGTH + 1} characters`);
    expect(problems[0]).toContain(`over GitHub's ${MAX_DESCRIPTION_LENGTH}`);
  });

  it("reports every problem rather than stopping at the first", () => {
    const problems = validateLabels([
      label({ color: "nope" }),
      label({ name: "feature", description: "" }),
      label({ name: "docs", color: 424242 }),
    ]);

    expect(problems).toHaveLength(3);
  });
});

describe("planLabelSync", () => {
  const existing = (overrides = {}) => ({
    name: "bug",
    color: "d73a4a",
    description: "Something is broken.",
    ...overrides,
  });

  it("creates a label GitHub does not have, carrying its color and description", () => {
    const plan = planLabelSync({ desired: [label()], existing: [] });

    expect(plan.created).toEqual([
      { name: "bug", color: "d73a4a", description: "Something is broken." },
    ]);
    expect(plan.updated).toEqual([]);
    expect(plan.unchanged).toEqual([]);
    expect(plan.deleted).toEqual([]);
    expect(plan.extra).toEqual([]);
  });

  it("leaves a matching label unchanged", () => {
    const plan = planLabelSync({ desired: [label()], existing: [existing()] });

    expect(plan.unchanged.map((entry) => entry.name)).toEqual(["bug"]);
    expect(plan.created).toEqual([]);
    expect(plan.updated).toEqual([]);
  });

  it("updates a drifted color", () => {
    const plan = planLabelSync({ desired: [label()], existing: [existing({ color: "000000" })] });

    expect(plan.updated).toEqual([
      { name: "bug", color: "d73a4a", description: "Something is broken." },
    ]);
    expect(plan.unchanged).toEqual([]);
  });

  it("updates a drifted description", () => {
    const plan = planLabelSync({
      desired: [label()],
      existing: [existing({ description: "Stale." })],
    });

    expect(plan.updated.map((entry) => entry.description)).toEqual(["Something is broken."]);
  });

  // GitHub returns null, not "", for a label created without a description.
  it("treats a null description on GitHub as empty", () => {
    const plan = planLabelSync({
      desired: [label()],
      existing: [existing({ description: null })],
    });

    expect(plan.updated.map((entry) => entry.name)).toEqual(["bug"]);
  });

  it("does not update when GitHub returns the color in uppercase", () => {
    const plan = planLabelSync({ desired: [label()], existing: [existing({ color: "D73A4A" })] });

    expect(plan.unchanged.map((entry) => entry.name)).toEqual(["bug"]);
    expect(plan.updated).toEqual([]);
  });

  // Names are matched exactly, so a case variant reads as a different label: the desired one is
  // created and the existing one is extra. GitHub rejects the create with a 422 rather than making
  // a second label, which is the loud failure. Prune would delete the variant.
  it("matches names exactly, so a case variant on GitHub is a different label", () => {
    const plan = planLabelSync({
      desired: [label()],
      existing: [existing({ name: "Bug" })],
      prune: true,
    });

    expect(plan.created.map((entry) => entry.name)).toEqual(["bug"]);
    expect(plan.extra).toEqual(["Bug"]);
    expect(plan.deleted).toEqual(["Bug"]);
  });

  it("reports a label missing from the file as extra", () => {
    const plan = planLabelSync({
      desired: [label()],
      existing: [existing(), existing({ name: "wontfix" })],
    });

    expect(plan.extra).toEqual(["wontfix"]);
  });

  it("does not plan a deletion without prune", () => {
    const plan = planLabelSync({ desired: [label()], existing: [existing({ name: "wontfix" })] });

    expect(plan.deleted).toEqual([]);
    expect(plan.extra).toEqual(["wontfix"]);
  });

  it("plans a deletion only when prune is requested", () => {
    const plan = planLabelSync({
      desired: [label()],
      existing: [existing({ name: "wontfix" })],
      prune: true,
    });

    expect(plan.deleted).toEqual(["wontfix"]);
  });

  it("never plans deleting a label that is in the file", () => {
    const plan = planLabelSync({
      desired: [label(), label({ name: "feature", color: "0e8a16" })],
      existing: [
        existing(),
        existing({ name: "feature", color: "cccccc" }),
        existing({ name: "wontfix" }),
      ],
      prune: true,
    });

    expect(plan.deleted).toEqual(["wontfix"]);
    expect(plan.created).toEqual([]);
    expect(plan.updated.map((entry) => entry.name)).toEqual(["feature"]);
  });

  it("plans every bucket at once", () => {
    const plan = planLabelSync({
      desired: [
        label(),
        label({ name: "feature", color: "0e8a16" }),
        label({ name: "docs", color: "0075ca" }),
      ],
      existing: [
        existing(),
        existing({ name: "feature", color: "cccccc" }),
        existing({ name: "wontfix" }),
      ],
      prune: true,
    });

    expect(plan.created.map((entry) => entry.name)).toEqual(["docs"]);
    expect(plan.updated.map((entry) => entry.name)).toEqual(["feature"]);
    expect(plan.unchanged.map((entry) => entry.name)).toEqual(["bug"]);
    expect(plan.deleted).toEqual(["wontfix"]);
  });

  it("carries only the fields GitHub is asked for", () => {
    const plan = planLabelSync({
      desired: [{ ...label(), notes: "internal" }],
      existing: [],
    });

    expect(Object.keys(plan.created[0])).toEqual(["name", "color", "description"]);
  });

  it("does not mutate its inputs", () => {
    const desired = [label()];
    const existingLabels = [existing({ name: "wontfix" })];

    planLabelSync({ desired, existing: existingLabels, prune: true });

    expect(desired).toEqual([label()]);
    expect(existingLabels).toEqual([existing({ name: "wontfix" })]);
  });
});

describe("formatPlanReport", () => {
  const plan = {
    created: [label({ name: "docs" })],
    updated: [label({ name: "feature" })],
    unchanged: [label()],
    deleted: ["wontfix"],
    extra: ["wontfix"],
  };

  const report = (overrides = {}) =>
    formatPlanReport({
      owner: "scottdensmore",
      repo: "my-first-commit",
      plan,
      dryRun: false,
      prune: false,
      ...overrides,
    }).join("\n");

  it("names the repository", () => {
    expect(report()).toContain("scottdensmore/my-first-commit");
  });

  it("uses past tense when the plan was applied", () => {
    const lines = report({ prune: true });

    expect(lines).toContain("created: docs");
    expect(lines).toContain("updated: feature");
    expect(lines).toContain("deleted: wontfix");
    expect(lines).not.toContain("dry run");
  });

  it("uses conditional tense in a dry run", () => {
    const lines = report({ dryRun: true, prune: true });

    expect(lines).toContain("(dry run, nothing changed)");
    expect(lines).toContain("would create: docs");
    expect(lines).toContain("would update: feature");
    expect(lines).toContain("would delete: wontfix");
  });

  it("previews every planned deletion in a dry run", () => {
    const lines = report({
      dryRun: true,
      prune: true,
      plan: { ...plan, deleted: ["wontfix", "duplicate", "invalid"] },
    });

    expect(lines).toContain("would delete: wontfix, duplicate, invalid");
  });

  it("counts unchanged labels rather than listing them", () => {
    expect(report()).toContain("unchanged: 1");
  });

  it("says none for an empty bucket", () => {
    const lines = report({
      plan: { created: [], updated: [], unchanged: [], deleted: [], extra: [] },
    });

    expect(lines).toContain("created: none");
    expect(lines).toContain("updated: none");
  });

  it("says none rather than omitting the deletion line when prune found nothing", () => {
    const lines = report({
      prune: true,
      plan: { ...plan, deleted: [], extra: [] },
    });

    expect(lines).toContain("deleted: none");
  });

  it("does not mention deletions at all without prune", () => {
    expect(report({ plan: { ...plan, deleted: [] } })).not.toContain("deleted");
  });

  it("reports labels it kept, and how they would be deleted, without prune", () => {
    const lines = report({ plan: { ...plan, deleted: [], extra: ["wontfix", "invalid"] } });

    expect(lines).toContain(
      "not in .github/labels.yml (kept, --prune would delete): wontfix, invalid",
    );
  });

  it("stays silent about extras when there are none", () => {
    const lines = report({ plan: { ...plan, deleted: [], extra: [] } });

    expect(lines).not.toContain("--prune would delete");
  });
});

describe("applyLabelPlan", () => {
  const recorder = () => {
    const calls = [];
    return { calls, request: async (route, parameters) => calls.push({ route, parameters }) };
  };

  const repository = { owner: "scottdensmore", repo: "my-first-commit" };

  const emptyPlan = { created: [], updated: [], unchanged: [], deleted: [], extra: [] };

  it("creates each planned label with exactly the planned fields", async () => {
    const { calls, request } = recorder();

    await applyLabelPlan(
      { ...emptyPlan, created: [{ name: "docs", color: "0075ca", description: "Docs." }] },
      { ...repository, request },
    );

    expect(calls).toEqual([
      {
        route: "POST /repos/{owner}/{repo}/labels",
        parameters: {
          owner: "scottdensmore",
          repo: "my-first-commit",
          name: "docs",
          color: "0075ca",
          description: "Docs.",
        },
      },
    ]);
  });

  it("updates each planned label under its existing name", async () => {
    const { calls, request } = recorder();

    await applyLabelPlan(
      { ...emptyPlan, updated: [{ name: "bug", color: "d73a4a", description: "Broken." }] },
      { ...repository, request },
    );

    expect(calls).toEqual([
      {
        route: "PATCH /repos/{owner}/{repo}/labels/{name}",
        parameters: {
          owner: "scottdensmore",
          repo: "my-first-commit",
          name: "bug",
          new_name: "bug",
          color: "d73a4a",
          description: "Broken.",
        },
      },
    ]);
  });

  it("deletes each planned label", async () => {
    const { calls, request } = recorder();

    await applyLabelPlan(
      { ...emptyPlan, deleted: ["wontfix", "invalid"] },
      { ...repository, request },
    );

    expect(calls.map((call) => [call.route, call.parameters.name])).toEqual([
      ["DELETE /repos/{owner}/{repo}/labels/{name}", "wontfix"],
      ["DELETE /repos/{owner}/{repo}/labels/{name}", "invalid"],
    ]);
  });

  it("sends nothing for unchanged labels", async () => {
    const { calls, request } = recorder();

    await applyLabelPlan({ ...emptyPlan, unchanged: [label()] }, { ...repository, request });

    expect(calls).toEqual([]);
  });

  // The safeguard the flag exists for: extras a prune-less plan kept are not deletable from here,
  // because the plan is the only thing this reads.
  it("deletes nothing when the plan kept its extras", async () => {
    const { calls, request } = recorder();
    const plan = planLabelSync({
      desired: [label()],
      existing: [{ name: "wontfix", color: "ffffff", description: "" }],
    });

    await applyLabelPlan(plan, { ...repository, request });

    expect(calls.some((call) => call.route.startsWith("DELETE"))).toBe(false);
  });

  it("sends nothing at all in a dry run", async () => {
    const { calls, request } = recorder();

    await applyLabelPlan(
      {
        ...emptyPlan,
        created: [label({ name: "docs" })],
        updated: [label({ name: "feature" })],
        deleted: ["wontfix"],
      },
      { ...repository, request, dryRun: true },
    );

    expect(calls).toEqual([]);
  });

  it("creates and updates before deleting", async () => {
    const { calls, request } = recorder();

    await applyLabelPlan(
      {
        ...emptyPlan,
        created: [label({ name: "docs" })],
        updated: [label({ name: "feature" })],
        deleted: ["wontfix"],
      },
      { ...repository, request },
    );

    expect(calls.map((call) => call.route.split(" ")[0])).toEqual(["POST", "PATCH", "DELETE"]);
  });

  it("reports what it sent", async () => {
    const { request } = recorder();

    const applied = await applyLabelPlan(
      {
        ...emptyPlan,
        created: [label({ name: "docs" })],
        updated: [label({ name: "feature" }), label({ name: "bug" })],
        deleted: ["wontfix"],
      },
      { ...repository, request },
    );

    expect(applied).toEqual({ created: 1, updated: 2, deleted: 1 });
  });

  it("stops at the first failed request rather than continuing", async () => {
    const calls = [];
    const request = async (route) => {
      calls.push(route);
      throw new Error("422 Validation Failed");
    };

    await expect(
      applyLabelPlan(
        { ...emptyPlan, created: [label({ name: "docs" }), label({ name: "feature" })] },
        { ...repository, request },
      ),
    ).rejects.toThrow("422 Validation Failed");

    expect(calls).toHaveLength(1);
  });
});
