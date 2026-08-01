#!/usr/bin/env node
// Keeps AGENTS.md the single source of agent instructions.
//
// CLAUDE.md, GEMINI.md, and .github/copilot-instructions.md must stay byte-for-byte pointers to
// AGENTS.md. Claude Code's `#` shortcut appends learnings to CLAUDE.md, which is exactly the drift
// this guards against: the check fails, and the content moves to AGENTS.md instead.
//
// Usage:
//   node scripts/check-agent-docs.mjs          verify (exit 1 on drift)
//   node scripts/check-agent-docs.mjs --fix    rewrite the pointer files from the template

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const CANONICAL_DOC = "AGENTS.md";
const MIN_CANONICAL_LINES = 20;
const WRAP_COLUMNS = 100;

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
  {
    file: ".github/copilot-instructions.md",
    title: "GitHub Copilot",
    link: "../AGENTS.md",
    note: "Anything worth remembering belongs in",
  },
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

  for (const doc of POINTER_DOCS) {
    const path = join(repoRoot, doc.file);
    const expected = expectedContent(doc);
    const actual = await readIfPresent(path);

    if (actual === expected) continue;

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
    console.error(
      `Move any real instructions into ${CANONICAL_DOC}, then run ` +
        "`npm run check:agent-docs -- --fix` to restore the pointer files.",
    );
    process.exit(1);
  }

  console.log("Agent docs are consistent.");
}

await main();
