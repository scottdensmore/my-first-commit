import { describe, expect, it } from "vitest";

import { chainedCommands, gateBlock, workflowRunsScript } from "./gate-commands.mjs";

describe("chainedCommands", () => {
  it("splits a chain in order", () => {
    expect(chainedCommands("npm audit && npm test && npm run build")).toEqual([
      "npm audit",
      "npm test",
      "npm run build",
    ]);
  });

  it("returns a single command unchanged", () => {
    expect(chainedCommands("npm audit")).toEqual(["npm audit"]);
  });

  it("drops empty segments from a trailing or doubled operator", () => {
    expect(chainedCommands("npm audit && && npm test &&")).toEqual(["npm audit", "npm test"]);
  });

  it("preserves arguments and flags", () => {
    expect(chainedCommands("npm run check:agent-docs -- --fix && npm test")).toEqual([
      "npm run check:agent-docs -- --fix",
      "npm test",
    ]);
  });
});

describe("gateBlock", () => {
  const block = (body, info = "bash") => ["```" + info, body, "```"].join("\n");

  it("reads the commands of a matching block", () => {
    const markdown = block("npm audit\nnpm test\nnpm run build");

    expect(gateBlock(markdown, "npm audit")).toEqual(["npm audit", "npm test", "npm run build"]);
  });

  it("strips trailing comments so a block can annotate its commands", () => {
    const markdown = block("npm audit    # dependency gate\nnpm test     # vitest");

    expect(gateBlock(markdown, "npm audit")).toEqual(["npm audit", "npm test"]);
  });

  it("ignores a full-line comment at column zero", () => {
    const markdown = block("# the gate\nnpm audit\nnpm test");

    expect(gateBlock(markdown, "npm audit")).toEqual(["npm audit", "npm test"]);
  });

  it("ignores blank lines between commands", () => {
    const markdown = block("npm audit\n\nnpm test");

    expect(gateBlock(markdown, "npm audit")).toEqual(["npm audit", "npm test"]);
  });

  it("skips a block whose first command does not match", () => {
    const markdown = [block("npm run validate"), block("npm audit\nnpm test")].join("\n\n");

    expect(gateBlock(markdown, "npm audit")).toEqual(["npm audit", "npm test"]);
  });

  it("returns null when no block matches", () => {
    expect(gateBlock(block("npm run dev"), "npm audit")).toBeNull();
  });

  it("returns null for markdown with no fenced block", () => {
    expect(gateBlock("Run `npm audit` before pushing.", "npm audit")).toBeNull();
  });

  it("accepts a fence with no info string", () => {
    expect(gateBlock(block("npm audit\nnpm test", ""), "npm audit")).toEqual([
      "npm audit",
      "npm test",
    ]);
  });

  it("accepts a sh fence", () => {
    expect(gateBlock(block("npm audit", "sh"), "npm audit")).toEqual(["npm audit"]);
  });

  it("does not read a non-shell block", () => {
    expect(gateBlock(block("npm audit", "text"), "npm audit")).toBeNull();
  });

  // The regression that motivated consuming every fence. A `text` block before the gate block used
  // to have its opening fence skipped, so its closing fence read as an opener and the prose after
  // it became a block of its own — which then shadowed or hid the real one.
  it("is not confused by a non-shell block appearing first", () => {
    const markdown = [
      block("v1.2.3", "text"),
      "Some prose between the blocks.",
      block("npm audit\nnpm test"),
    ].join("\n\n");

    expect(gateBlock(markdown, "npm audit")).toEqual(["npm audit", "npm test"]);
  });
});

describe("workflowRunsScript", () => {
  it("accepts the inline run form", () => {
    const workflow = ["      - name: Validate", "        run: npm run validate"].join("\n");

    expect(workflowRunsScript(workflow, "validate")).toBe(true);
  });

  it("accepts a block scalar body", () => {
    const workflow = [
      "      - name: Validate",
      "        run: |",
      "          npm run validate",
    ].join("\n");

    expect(workflowRunsScript(workflow, "validate")).toBe(true);
  });

  it.each(["|", ">", "|-", "|+", ">-", "|2"])("accepts a %s block indicator", (indicator) => {
    const workflow = ["        run: " + indicator, "          npm run validate"].join("\n");

    expect(workflowRunsScript(workflow, "validate")).toBe(true);
  });

  it("keeps a trailing YAML comment on the run line from hiding the command", () => {
    const workflow = "        run: npm run validate # the whole gate";

    expect(workflowRunsScript(workflow, "validate")).toBe(true);
  });

  it("reports a workflow that runs something else", () => {
    const workflow = ["      - name: Audit", "        run: npm audit"].join("\n");

    expect(workflowRunsScript(workflow, "validate")).toBe(false);
  });

  // The regression this function exists for. A substring search over the raw file is satisfied by
  // the comment that explains why CI calls the script, so the check passed with the gate's commands
  // re-inlined underneath it — asserting the rule was enforced when it was not.
  it("does not accept a YAML comment naming the script above re-inlined commands", () => {
    const workflow = [
      "      # `npm run validate` is the same gate contributors run locally.",
      "      - name: Audit",
      "        run: npm audit",
      "",
      "      - name: Test",
      "        run: npm test",
    ].join("\n");

    expect(workflowRunsScript(workflow, "validate")).toBe(false);
  });

  it("does not accept a shell comment inside a block scalar", () => {
    const workflow = [
      "        run: |",
      "          # npm run validate covers this",
      "          npm audit",
    ].join("\n");

    expect(workflowRunsScript(workflow, "validate")).toBe(false);
  });

  it("does not accept a step named after the script", () => {
    const workflow = ["      - name: Run npm run validate steps", "        run: npm audit"].join(
      "\n",
    );

    expect(workflowRunsScript(workflow, "validate")).toBe(false);
  });

  // A block scalar has to end at the first line indented no further than its `run:` key. Without
  // that, every later indented line still counts as shell, so a mention of the script in an
  // unrelated step's value reads as an invocation.
  it("does not treat a later step as part of an earlier block scalar", () => {
    const workflow = [
      "      - name: Install",
      "        run: |",
      "          npx playwright install",
      "      - name: Audit",
      "        run: npm audit",
      "        env:",
      "          NOTE: replaces npm run validate",
    ].join("\n");

    expect(workflowRunsScript(workflow, "validate")).toBe(false);
  });

  it("does not accept a different script that starts with the same name", () => {
    const workflow = "        run: npm run validate:deployed";

    expect(workflowRunsScript(workflow, "validate")).toBe(false);
    expect(workflowRunsScript(workflow, "validate:deployed")).toBe(true);
  });

  it("accepts the script as one command in a chain", () => {
    const workflow = "        run: npm ci && npm run validate";

    expect(workflowRunsScript(workflow, "validate")).toBe(true);
  });
});
