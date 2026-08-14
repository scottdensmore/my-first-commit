// Reads the validation gate out of the npm script that defines it, and out of the documentation
// that copies it.
//
// Used by check-agent-docs.mjs. `CI / validate` runs `npm run validate` rather than its own step
// list, so CI cannot drift from the script. Documentation still spells the chain out — readers need
// to know what the gate covers, and the verifier sub-agent needs the individual commands for scoped
// reruns — and those copies can drift, which is what these functions let the check catch.

/**
 * The commands an `a && b && c` npm script runs, in order.
 *
 * Splitting on `&&` is enough for a chain of plain commands, which is all the gate script is. It
 * would not survive `&&` inside a quoted argument, a subshell, or `||`. If the script ever grows
 * one of those, this needs a real shell parser rather than a wider regex.
 *
 * The failure is loud — a mangled segment stops matching the documented list — but the tempting fix
 * is to paste the mangled segments into the documentation until the check passes. That silences the
 * check by making the documentation wrong, which is the failure this exists to prevent.
 */
export function chainedCommands(script) {
  return script
    .split("&&")
    .map((command) => command.trim())
    .filter((command) => command !== "");
}

/**
 * The gate command list from a Markdown file: the commands of the first fenced block whose first
 * command is `firstCommand`, or null when no block matches.
 *
 * Blocks may annotate commands with trailing `#` comments and may separate them with blank lines,
 * so documentation stays readable without reading as drift.
 */
export function gateBlock(markdown, firstCommand) {
  // Every fence has to be consumed, whatever its info string. Matching only bash fences skips a
  // `text` or `env` block's opening fence and then reads its closing fence as an opener, which
  // turns the prose after it into a phantom block.
  for (const [, info, body] of markdown.matchAll(/```([^\n]*)\n([\s\S]*?)```/g)) {
    if (!["", "bash", "sh"].includes(info.trim())) continue;

    const commands = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("#"))
      .map((line) => line.replace(/\s+#.*$/, "").trim());

    if (commands[0] === firstCommand) return commands;
  }

  return null;
}

/**
 * Whether a GitHub Actions workflow actually invokes `npm run <scriptName>`.
 *
 * Only the value of a `run:` key counts, in either the inline or the `|` block form. A plain
 * substring search over the file does not work: the workflow's own comment names the gate script
 * while explaining why CI calls it, so the search is satisfied by the explanation of the rule even
 * when the commands have been re-inlined below it — and a step named after the script would pass
 * too. Comment lines are skipped in both YAML and the shell inside a block scalar, since neither
 * runs.
 */
export function workflowRunsScript(workflow, scriptName) {
  // The name must end where the invocation ends, so `npm run validate:deployed` does not satisfy a
  // check for `validate`. npm script names routinely differ only by a `:` suffix.
  const escaped = scriptName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const invocation = new RegExp(`npm run ${escaped}(?![\\w:.-])`);
  let blockIndent = null;

  for (const line of workflow.split("\n")) {
    if (/^\s*#/.test(line)) continue;

    const indent = line.length - line.trimStart().length;

    if (blockIndent !== null) {
      if (line.trim() === "") continue;
      if (indent > blockIndent) {
        if (invocation.test(line)) return true;
        continue;
      }
      blockIndent = null;
    }

    const run = /^\s*(?:-\s*)?run:\s*(.*)$/.exec(line);
    if (run === null) continue;

    const value = run[1].trim();

    // `|`, `>`, and their chomping and indentation indicators all open a block scalar whose body is
    // the indented lines that follow.
    if (/^[|>][-+]?\d*$/.test(value)) {
      blockIndent = indent;
      continue;
    }

    if (invocation.test(value)) return true;
  }

  return false;
}
