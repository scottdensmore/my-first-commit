#!/usr/bin/env node
// Guards the three repository-level claims that nothing else can check, and that are wrong quietly
// rather than loudly when they break:
//
//   1. AGENTS.md is the single source of agent instructions. CLAUDE.md and GEMINI.md must stay
//      byte-for-byte pointers to it. Claude Code's `#` shortcut appends learnings to CLAUDE.md,
//      which is exactly the drift this guards against: the check fails, and the content moves to
//      AGENTS.md instead. .github/copilot-instructions.md must not exist, since it would outrank it.
//   2. The tooling-state directories are ignored by every gate that reads source, which is what
//      makes the unread-path verification exemption in AGENTS.md sound. Prettier and ESLint ignore
//      them by name; Vitest reaches the same result by collecting only from the product-code roots,
//      so that check reads its scope rather than a list of exclusions.
//   3. `npm run validate` is the one definition of the validation gate: CI invokes that script, and
//      the two places that write the chain out in order still match it.
//
// Inputs are therefore wider than the name suggests: AGENTS.md and the pointer files, .prettierignore,
// eslint.config.mjs, vitest.config.mts, package.json, .github/workflows/ci.yml, docs/development.md,
// and .claude/agents/verifier.md. Step 7 of AGENTS.md maps each of those to this command.
//
// Usage:
//   node scripts/check-agent-docs.mjs          verify (exit 1 on drift)
//   node scripts/check-agent-docs.mjs --fix    rewrite the pointer files from the template

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chainedCommands, gateBlock, workflowRunsScript } from "./gate-commands.mjs";
import { globRoots, hasGitignoreEntry, hasQuotedEntry } from "./ignore-entries.mjs";
import { installedBrowsers, requiredEngines, runsBrowserSuite } from "./browser-projects.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_DOC = "AGENTS.md";
const MIN_CANONICAL_LINES = 20;
const WRAP_COLUMNS = 100;

// `link` is the path to AGENTS.md relative to the pointer file's own directory. Both current
// pointers sit at the repo root, so both use "AGENTS.md"; a pointer added under a subdirectory
// needs its own relative path, for example "../AGENTS.md".
const POINTER_DOCS = [
  {
    file: "CLAUDE.md",
    title: "Claude Code",
    link: "AGENTS.md",
    note: "Anything captured with the `#` shortcut during a session belongs in",
  },
  {
    file: "GEMINI.md",
    title: "Gemini CLI",
    link: "AGENTS.md",
    note: "Anything worth remembering belongs in",
  },
];

// Files that must not exist. GitHub ranks .github/copilot-instructions.md above AGENTS.md, so a
// regenerated one would quietly become the highest-precedence instruction source and AGENTS.md
// would no longer be canonical. Copilot is not used here, and its CLI, cloud agent, and code
// review read AGENTS.md natively.
const FORBIDDEN_DOCS = [".github/copilot-instructions.md"];

// Tooling state managed by external agent tools. AGENTS.md exempts changes confined to these
// directories from local verification, which is only sound while every gate that reads source
// ignores them. Both lists must agree, so drift in one is a real failure rather than a nit.
const TOOLING_DIRS = [".claude", ".codex", ".entire", ".vercel"];
const IGNORE_LISTS = [
  { file: ".prettierignore", has: (contents, dir) => hasGitignoreEntry(contents, dir) },
  { file: "eslint.config.mjs", has: (contents, dir) => hasQuotedEntry(contents, `${dir}/**`) },
];

// The third gate that reads source, Vitest, is checked by its scope instead. It collects from these
// roots only, so the tooling-state directories are out of reach without being named — and so is a
// stray spec at the repository root or in a directory nobody has thought to exclude, which is the
// case a denylist keeps losing. Widening the scope has to happen here as well as in the config,
// which is where the exemption in AGENTS.md gets re-read.
// Every workflow that runs the browser suite installs browsers with its own hand-written list.
// Nothing kept those lists in step with the config, so adding a project updated one workflow and
// not the other, and the mismatch surfaced as a failed production health check after a deploy --
// which no local command can reach, since that workflow only runs on a production deployment_status.
const BROWSER_CONFIG = "playwright.config.ts";
const WORKFLOW_DIR = ".github/workflows";

const COLLECTION_FILE = "vitest.config.mts";
const COLLECTION_ROOTS = ["app", "scripts"];

// `npm run validate` is the gate. Two things have to hold for that to stay true. CI must invoke the
// script rather than inlining its own step list, or the local gate and the CI gate become two lists
// again. And the two files that write the chain out in order — readers need to know what the gate
// covers, and the verifier needs the individual commands for scoped reruns — must still match it.
const GATE_SCRIPT = "validate";
const GATE_DOCS = ["docs/development.md", ".claude/agents/verifier.md"];
const GATE_WORKFLOW = ".github/workflows/ci.yml";

function wrap(text, width) {
  const lines = [];
  let current = "";

  for (const word of text.split(" ")) {
    if (current === "") {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current !== "") lines.push(current);
  return lines.join("\n");
}

function expectedContent({ title, link, note }) {
  const paragraphs = [
    `# ${title}`,
    `Project instructions for this repository live in one canonical file: [${CANONICAL_DOC}](${link}).`,
    `Read [${CANONICAL_DOC}](${link}) for commands, layout, gotchas, and conventions.`,
    `Do not add project instructions to this file. ${note} [${CANONICAL_DOC}](${link}) instead. ` +
      "CI runs `npm run check:agent-docs`, which fails if this file drifts from the pointer template.",
  ];

  return `${paragraphs.map((paragraph) => wrap(paragraph, WRAP_COLUMNS)).join("\n\n")}\n`;
}

async function readIfPresent(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function firstDifference(actual, expected) {
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");

  for (let index = 0; index < Math.max(actualLines.length, expectedLines.length); index += 1) {
    if (actualLines[index] !== expectedLines[index]) {
      return {
        line: index + 1,
        actual: actualLines[index] ?? "<end of file>",
        expected: expectedLines[index] ?? "<end of file>",
      };
    }
  }

  return null;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const problems = [];

  const canonical = await readIfPresent(join(repoRoot, CANONICAL_DOC));
  if (canonical === null) {
    problems.push(`${CANONICAL_DOC} is missing. It holds the canonical agent instructions.`);
  } else if (canonical.trim().split("\n").length < MIN_CANONICAL_LINES) {
    problems.push(
      `${CANONICAL_DOC} looks empty or stubbed out. Agent instructions belong there, not in the ` +
        "pointer files.",
    );
  }

  for (const file of FORBIDDEN_DOCS) {
    if ((await readIfPresent(join(repoRoot, file))) === null) continue;
    problems.push(
      `${file} exists. It outranks ${CANONICAL_DOC}, so it would quietly become the highest-` +
        `precedence instruction source. Move its content into ${CANONICAL_DOC} and delete it.`,
    );
  }

  let pointerDrifted = false;

  const packageJson = await readIfPresent(join(repoRoot, "package.json"));
  let gateScript;

  if (packageJson === null) {
    problems.push("package.json is missing. It defines the validation gate.");
  } else {
    let parsed;
    let parseFailed = false;

    try {
      parsed = JSON.parse(packageJson);
    } catch (error) {
      parseFailed = true;
      problems.push(`package.json is not valid JSON, so the gate cannot be read: ${error.message}`);
    }

    if (parseFailed) {
      // Already reported; fall through without a second, vaguer message.
    } else if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      problems.push("package.json does not contain a JSON object, so the gate cannot be read.");
    } else {
      gateScript = parsed.scripts?.[GATE_SCRIPT];

      if (typeof gateScript !== "string") {
        problems.push(
          gateScript === undefined
            ? `package.json has no \`${GATE_SCRIPT}\` script. It defines the validation gate.`
            : `The \`${GATE_SCRIPT}\` script in package.json is not a string, so the gate cannot ` +
                "be read. It must be the gate commands chained with `&&`.",
        );
        gateScript = undefined;
      }
    }
  }

  const gate = gateScript === undefined ? [] : chainedCommands(gateScript);

  if (gateScript !== undefined && gate.length === 0) {
    problems.push(`The \`${GATE_SCRIPT}\` script in package.json is empty. It defines the gate.`);
  }

  if (gate.length > 0) {
    const workflow = await readIfPresent(join(repoRoot, GATE_WORKFLOW));

    // The "CI cannot drift from the documented gate" claim rests entirely on CI invoking the
    // script. Inlining the commands here again would make that claim silently false everywhere it
    // is written down, and nothing else would notice.
    if (workflow === null) {
      problems.push(`${GATE_WORKFLOW} is missing. It runs the validation gate.`);
    } else if (!workflowRunsScript(workflow, GATE_SCRIPT)) {
      problems.push(
        `${GATE_WORKFLOW} does not run \`npm run ${GATE_SCRIPT}\`. CI must invoke the gate script ` +
          "rather than listing its commands, so that the local gate and the CI gate stay one " +
          "definition.",
      );
    }

    for (const file of GATE_DOCS) {
      const contents = await readIfPresent(join(repoRoot, file));

      if (contents === null) {
        problems.push(`${file} is missing. It documents the \`${GATE_SCRIPT}\` command list.`);
        continue;
      }

      const documented = gateBlock(contents, gate[0]);

      if (documented === null) {
        problems.push(
          `${file} has no command block starting with \`${gate[0]}\`, so its copy of the ` +
            `\`${GATE_SCRIPT}\` gate cannot be checked. Restore the block, or drop ${file} from ` +
            "GATE_DOCS if it no longer lists the gate.",
        );
        continue;
      }

      if (documented.join("\n") !== gate.join("\n")) {
        problems.push(
          `${file} lists a different \`${GATE_SCRIPT}\` gate than package.json.\n` +
            `    package.json: ${gate.join(", ")}\n` +
            `    ${file}: ${documented.join(", ")}`,
        );
      }
    }
  }

  for (const list of IGNORE_LISTS) {
    const contents = await readIfPresent(join(repoRoot, list.file));

    if (contents === null) {
      problems.push(`${list.file} is missing. It must ignore the tooling-state directories.`);
      continue;
    }

    const missing = TOOLING_DIRS.filter((dir) => !list.has(contents, dir));

    if (missing.length > 0) {
      problems.push(
        `${list.file} no longer ignores ${missing.join(", ")}. The verification exemption in ` +
          `${CANONICAL_DOC} assumes .prettierignore and eslint.config.mjs ignore the same ` +
          "tooling-state directories, and that vitest.config.mts collects from product code only. " +
          "Restore the entry, or update the exemption.",
      );
    }
  }

  const collection = await readIfPresent(join(repoRoot, COLLECTION_FILE));

  if (collection === null) {
    problems.push(`${COLLECTION_FILE} is missing. It scopes the unit test run to product code.`);
  } else {
    const roots = [...globRoots(collection)].sort();
    const expected = [...COLLECTION_ROOTS].sort();

    if (roots.join("\n") !== expected.join("\n")) {
      problems.push(
        `${COLLECTION_FILE} collects from ${roots.length > 0 ? roots.join(", ") : "no named root"} ` +
          `rather than from ${expected.join(", ")}. Unit collection is scoped positively so that a ` +
          "stray spec outside those roots cannot fail the gate or silently join it, and so that " +
          `the verification exemption in ${CANONICAL_DOC} holds without naming every directory to ` +
          "skip. A pattern reported as `**`, `.` or an empty root is not anchored to a directory " +
          "and gives the walk the whole tree back. Update COLLECTION_ROOTS here and the exemption " +
          `in ${CANONICAL_DOC} when a root is deliberately added.`,
      );
    }
  }

  const browserConfig = await readIfPresent(join(repoRoot, BROWSER_CONFIG));

  if (browserConfig === null) {
    problems.push(`${BROWSER_CONFIG} is missing. It declares the browser projects the suite runs.`);
  } else {
    // Resolved from Playwright itself rather than a table kept here: a device descriptor's engine
    // is Playwright's fact, and a copy of it would be one more list to drift.
    const { devices } = await import("@playwright/test");
    const deviceEngines = Object.fromEntries(
      Object.entries(devices).map(([name, device]) => [name, device.defaultBrowserType]),
    );

    let required = null;

    try {
      required = requiredEngines(browserConfig, deviceEngines);
    } catch (error) {
      problems.push(`${BROWSER_CONFIG} cannot be read for its browsers: ${error.message}`);
    }

    if (required !== null) {
      const workflowDir = join(repoRoot, WORKFLOW_DIR);
      const workflowFiles = (await readdir(workflowDir)).filter((file) => file.endsWith(".yml"));

      for (const file of workflowFiles.sort()) {
        const workflow = await readFile(join(workflowDir, file), "utf8");
        if (!runsBrowserSuite(workflow)) continue;

        const installed = installedBrowsers(workflow);

        if (installed === null) {
          problems.push(
            `${WORKFLOW_DIR}/${file} runs the browser suite but never installs a browser. ` +
              `It needs ${[...required].sort().join(", ")}.`,
          );
          continue;
        }

        // An install naming nothing installs everything, so it satisfies any requirement.
        if (installed.size === 0) continue;

        const missing = [...required].filter((engine) => !installed.has(engine)).sort();

        if (missing.length > 0) {
          problems.push(
            `${WORKFLOW_DIR}/${file} installs ${[...installed].sort().join(", ")} but the ` +
              `projects in ${BROWSER_CONFIG} need ${[...required].sort().join(", ")}; ` +
              `${missing.join(", ")} is missing. Playwright fails at browser launch rather than ` +
              "skipping the project, and a workflow that runs only after a deploy reports that " +
              "as a failed production check rather than as a failed pull request.",
          );
        }
      }
    }
  }

  for (const doc of POINTER_DOCS) {
    const path = join(repoRoot, doc.file);
    const expected = expectedContent(doc);
    const actual = await readIfPresent(path);

    if (actual === expected) continue;
    pointerDrifted = true;

    if (fix) {
      await writeFile(path, expected, "utf8");
      console.log(`fixed ${doc.file}`);
      continue;
    }

    if (actual === null) {
      problems.push(`${doc.file} is missing.`);
      continue;
    }

    const difference = firstDifference(actual, expected);
    problems.push(
      `${doc.file} has drifted from the pointer template at line ${difference.line}.\n` +
        `    expected: ${difference.expected}\n` +
        `    actual:   ${difference.actual}`,
    );
  }

  if (fix) {
    if (problems.length > 0) {
      console.error(problems.join("\n\n"));
      process.exit(1);
    }
    console.log("Agent docs are consistent.");
    return;
  }

  if (problems.length > 0) {
    console.error("Agent instruction files are out of sync:\n");
    console.error(`${problems.join("\n\n")}\n`);
    // Only suggest --fix when it can actually help. It rewrites drifted pointers; it never
    // deletes a forbidden file, so offering it there would send the reader in a circle.
    if (pointerDrifted) {
      console.error(
        `Move any real instructions into ${CANONICAL_DOC}, then run ` +
          "`npm run check:agent-docs -- --fix` to restore the pointer files.",
      );
    }
    process.exit(1);
  }

  console.log("Agent docs are consistent.");
}

await main();
