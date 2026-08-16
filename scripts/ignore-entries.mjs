// Detects whether an ignore list still contains a given entry.
//
// Used by check-agent-docs.mjs to prove that .prettierignore, eslint.config.mjs, and
// vitest.config.mts ignore the same tooling-state directories, which is what makes the verification
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
 * Walks `source` once, yielding a token for each string literal, identifier, and punctuation
 * character, and skipping comments. A `/*` or `//` inside a string is literal text, because a
 * string is consumed as a unit before comment detection resumes.
 *
 * Everything else in this module reads the config through this, so there is one place that knows
 * how to tell a quote from a comment from a bracket. `includeLiterals` needs the punctuation to
 * find an array; `stringLiterals` throws it away. Duplicating the walk for the two of them meant
 * two copies of the escape and comment handling, one of which no test reached.
 *
 * This is a scanner, not a parser. It does not recognise regex literals, so an unpaired quote
 * inside one (`/'/`) shifts quote parity and can mis-tokenise the rest of the file. Neither config
 * file it reads contains a regex literal; if one ever does, prefer a real parser over patching this.
 */
function* scanTokens(source) {
  let index = 0;
  let word = "";

  const flushWord = function* () {
    if (word !== "") {
      yield { word };
      word = "";
    }
  };

  while (index < source.length) {
    const character = source[index];
    const following = source[index + 1];

    if (character === "/" && following === "/") {
      yield* flushWord();
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (character === "/" && following === "*") {
      yield* flushWord();
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      continue;
    }

    if (character === '"' || character === "'" || character === "`") {
      yield* flushWord();
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
      yield { string: value };
      continue;
    }

    if (/[A-Za-z0-9_$]/.test(character)) {
      word += character;
      index += 1;
      continue;
    }

    yield* flushWord();
    yield { punctuation: character };
    index += 1;
  }

  yield* flushWord();
}

/** Yields the value of every string literal in `source`, skipping comments. */
export function* stringLiterals(source) {
  for (const token of scanTokens(source)) {
    if (token.string !== undefined) yield token.string;
  }
}

/**
 * Yields every string literal inside the `include: [ ... ]` array, and nothing outside it.
 *
 * Scoped to that array on purpose. Reading every literal in the file was fine while the config had
 * one option, but a coverage block carrying `exclude: ["coverage/**"]` then registered `coverage`
 * as a collection root and failed the gate -- correctly, since a whole-file read cannot tell a
 * coverage pattern from a widened test scope. The cost was real: it kept the coverage
 * configuration from being scoped at all.
 *
 * Brackets are counted over tokens rather than raw text, which is not a nicety. A collection
 * pattern contains them -- `"app/**\/*.{test,spec}.?(c|m)[jt]s?(x)"` has `[jt]` -- so counting
 * them in the source would end the array in the middle of the first pattern and report fewer roots
 * than there are. Fewer is the dangerous direction: it is the one that lets a widened scope pass.
 *
 * `include` is only recognised inside `test: { ... }`, or at the top level of a bare fragment, so
 * a coverage block's own `include` is not mistaken for the collection scope. A computed key or a
 * spread array is not recognised at all, and the caller then sees no roots and reports drift
 * rather than guessing.
 */
export function* includeLiterals(source) {
  let pendingKey = "";
  let depth = 0;
  const objectKeys = [];

  const inCollectionObject = () =>
    objectKeys.length === 0 || objectKeys[objectKeys.length - 1] === "test";

  for (const token of scanTokens(source)) {
    if (token.string !== undefined) {
      if (depth > 0) yield token.string;
      pendingKey = "";
      continue;
    }

    if (token.word !== undefined) {
      pendingKey = token.word;
      continue;
    }

    switch (token.punctuation) {
      case ":":
        break;
      case "{":
        objectKeys.push(pendingKey);
        pendingKey = "";
        break;
      case "}":
        objectKeys.pop();
        pendingKey = "";
        break;
      case "[":
        if (depth > 0) depth += 1;
        else if (pendingKey === "include" && inCollectionObject()) depth = 1;
        pendingKey = "";
        break;
      case "]":
        if (depth > 0) depth -= 1;
        break;
      default:
        if (!/\s/.test(token.punctuation)) pendingKey = "";
    }
  }
}

/**
 * The directory each collection pattern is anchored to: `"app/**\/*.test.ts"` yields `app`. Used to
 * prove that Vitest collects from a named set of roots rather than from the whole tree, which is a
 * claim a denylist cannot make -- it can only name the directories somebody has thought of.
 *
 * A literal with no `*` is not a pattern and is skipped. A pattern that is not anchored to a
 * directory -- `"**\/*.test.ts"`, `"/app/**"`, `"./app/**"` -- yields its leading segment verbatim
 * (`**`, ``, `.`), which no root list contains, so the caller reports drift rather than silently
 * accepting a widened scope. A config with no readable `include` yields nothing, which the caller
 * reports as collecting from no named root rather than passing vacuously.
 */
export function globRoots(source) {
  const roots = new Set();

  for (const value of includeLiterals(source)) {
    if (!value.includes("*")) continue;
    roots.add(value.split("/")[0]);
  }

  return roots;
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

/** JavaScript or TypeScript source: a string literal equal to `entry`, in any array layout. */
export function hasQuotedEntry(source, entry) {
  for (const value of stringLiterals(source)) {
    if (value === entry) return true;
  }

  return false;
}
