// Detects whether an ignore list still contains a given entry.
//
// Used by check-agent-docs.mjs to prove that .prettierignore, eslint.config.mjs, and
// vitest.config.ts ignore the same tooling-state directories, which is what makes the verification
// exemption in AGENTS.md sound.
//
// Scope: this is a tripwire against an entry being deleted or commented out, not a proof that the
// directory is ignored. It checks that the string appears somewhere outside a comment, so a config
// that mentioned the path for some other reason would satisfy it. That is the right cost here —
// the realistic failure is someone trimming an ignore list, and CI runs the complete gate on every
// pull request regardless.
//
// Matching is neither line-based nor regex-based over the raw source. Prettier collapses a short
// array onto one line, so a per-line check would report a correctly formatted config as broken.
// Stripping comments with a regex is worse: the `/*` inside a glob such as "**/node_modules/**"
// reads as a block-comment opener, so a pure reorder of the array would corrupt the scan. Instead,
// walk the source once and yield string literals, which neither of those confuses.

/**
 * Yields the value of every string literal in `source`, skipping comments. A `/*` or `//` inside a
 * string is literal text, because a string is consumed as a unit before comment detection resumes.
 *
 * This is a scanner, not a parser. It does not recognise regex literals, so an unpaired quote
 * inside one (`/'/`) shifts quote parity and can mis-tokenise the rest of the file. Neither config
 * file it reads contains a regex literal; if one ever does, prefer a real parser over patching this.
 */
export function* stringLiterals(source) {
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    const following = source[index + 1];

    if (character === "/" && following === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (character === "/" && following === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      let value = "";
      index += 1;

      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          value += source[index + 1] ?? "";
          index += 2;
          continue;
        }

        value += source[index];
        index += 1;
      }

      index += 1;
      yield value;
      continue;
    }

    index += 1;
  }
}

/**
 * Gitignore syntax: one entry per line, `#` comments. Accepts the equivalent spellings of a
 * directory entry — `.claude`, `.claude/`, and `/.claude` all ignore the same path — but not a
 * negation or a different path.
 */
export function hasGitignoreEntry(contents, entry) {
  return contents.split("\n").some((line) => {
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith("!")) return false;

    return trimmed.replace(/^\//, "").replace(/\/$/, "") === entry;
  });
}

/**
 * The directory each glob-shaped string literal in `source` is anchored to: `"app/**\/*.test.ts"`
 * yields `app`. Used to prove that Vitest collects from a named set of roots rather than from the
 * whole tree, which is a claim a denylist cannot make — it can only name the directories somebody
 * has thought of.
 *
 * A literal with no `*` is not a pattern and is skipped, so a config's other strings do not appear.
 * A pattern that is not anchored to a directory — `"**\/*.test.ts"`, `"/app/**"`, `"./app/**"` —
 * yields its leading segment verbatim (`**`, ``, `.`), which no root list contains, so the caller
 * reports drift rather than silently accepting a widened scope.
 *
 * Same scope as the rest of this module: a tripwire, not a parser. It reads every pattern in the
 * file, not only the ones in `include`, so a glob added for some unrelated option would have to be
 * accounted for here too. In a file this small, a check that fails loudly beats one that guesses.
 */
export function globRoots(source) {
  const roots = new Set();

  for (const value of stringLiterals(source)) {
    if (!value.includes("*")) continue;
    roots.add(value.split("/")[0]);
  }

  return roots;
}

/** JavaScript or TypeScript source: a string literal equal to `entry`, in any array layout. */
export function hasQuotedEntry(source, entry) {
  for (const value of stringLiterals(source)) {
    if (value === entry) return true;
  }

  return false;
}
