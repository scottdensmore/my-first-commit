#!/usr/bin/env node
// Keeps AGENTS.md the single source of agent instructions.
//
// CLAUDE.md and GEMINI.md must stay byte-for-byte pointers to AGENTS.md. Claude Code's `#` shortcut
// appends learnings to CLAUDE.md, which is exactly the drift this guards against: the check fails,
// and the content moves to AGENTS.md instead.
//
// Usage:
//   node scripts/check-agent-docs.mjs          verify (exit 1 on drift)
//   node scripts/check-agent-docs.mjs --fix    rewrite the pointer files from the template

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { hasGitignoreEntry, hasQuotedEntry } from "./ignore-entries.mjs";

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
// ignores them. Three files must agree, so drift in one is a real failure rather than a nit.
const TOOLING_DIRS = [".claude", ".codex", ".entire", ".vercel"];
const IGNORE_LISTS = [
  { file: ".prettierignore", has: (contents, dir) => hasGitignoreEntry(contents, dir) },
  { file: "eslint.config.mjs", has: (contents, dir) => hasQuotedEntry(contents, `${dir}/**`) },
  { file: "vitest.config.ts", has: (contents, dir) => hasQuotedEntry(contents, `${dir}/**`) },
];

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
          `${CANONICAL_DOC} assumes .prettierignore, eslint.config.mjs, and vitest.config.ts all ` +
          "ignore the same tooling-state directories. Restore the entry, or update the exemption.",
      );
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
