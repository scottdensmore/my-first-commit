import { describe, expect, it } from "vitest";

import { globRoots, hasGitignoreEntry, hasQuotedEntry, stringLiterals } from "./ignore-entries.mjs";

describe("hasGitignoreEntry", () => {
  it("matches an entry on its own line", () => {
    expect(hasGitignoreEntry(".next\n.claude\n.vercel\n", ".claude")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(hasGitignoreEntry("  .claude  \n", ".claude")).toBe(true);
  });

  it("reports a missing entry", () => {
    expect(hasGitignoreEntry(".next\n.vercel\n", ".claude")).toBe(false);
  });

  it.each([".claude", ".claude/", "/.claude", "/.claude/"])(
    "accepts %j as an equivalent spelling",
    (line) => {
      expect(hasGitignoreEntry(`${line}\n`, ".claude")).toBe(true);
    },
  );

  it.each(["# .claude", "#.claude", "!.claude", ".claude-old", "docs/.claude", ".claude/agents"])(
    "does not accept %j as the entry",
    (line) => {
      expect(hasGitignoreEntry(`${line}\n`, ".claude")).toBe(false);
    },
  );
});

describe("hasQuotedEntry", () => {
  it("matches an expanded array", () => {
    const source = ["exclude: [", '  "**/node_modules/**",', '  ".claude/**",', "]"].join("\n");

    expect(hasQuotedEntry(source, ".claude/**")).toBe(true);
  });

  it("is unaffected by the position of globs containing slash-star", () => {
    const before = '["**/node_modules/**", "**/.next/**", ".claude/**"]';
    const after = '[".claude/**", "**/node_modules/**", "**/.next/**"]';

    expect(hasQuotedEntry(before, ".claude/**")).toBe(true);
    expect(hasQuotedEntry(after, ".claude/**")).toBe(true);
  });

  it("does not accept an entry left in a trailing comment", () => {
    expect(hasQuotedEntry('exclude: ["a"], // ".claude/**"', ".claude/**")).toBe(false);
  });

  it("does not accept an entry left in a trailing block comment", () => {
    expect(hasQuotedEntry('exclude: ["a"], /* ".claude/**" */', ".claude/**")).toBe(false);
  });

  it("matches an array Prettier collapsed onto one line", () => {
    expect(hasQuotedEntry('exclude: ["**/node_modules/**", ".claude/**"],', ".claude/**")).toBe(
      true,
    );
  });

  it("matches regardless of quote style", () => {
    expect(hasQuotedEntry("['.claude/**']", ".claude/**")).toBe(true);
  });

  it("reports a missing entry", () => {
    expect(hasQuotedEntry('exclude: ["**/node_modules/**"]', ".claude/**")).toBe(false);
  });

  it("does not accept a line-commented entry", () => {
    expect(hasQuotedEntry('  // ".claude/**",', ".claude/**")).toBe(false);
  });

  it("does not accept a block-commented entry", () => {
    expect(hasQuotedEntry('/*\n  ".claude/**",\n*/', ".claude/**")).toBe(false);
  });

  it("does not accept a block comment on one line", () => {
    expect(hasQuotedEntry('/* ".claude/**", */', ".claude/**")).toBe(false);
  });

  it.each(['".claude-old/**"', '"docs/.claude/**"', '"**/.claude/**"', '".claude/**/*"'])(
    "does not accept %s as the entry",
    (token) => {
      expect(hasQuotedEntry(`exclude: [${token}]`, ".claude/**")).toBe(false);
    },
  );

  it("treats the entry as a literal rather than a pattern", () => {
    expect(hasQuotedEntry('["Xclaude/XX"]', ".claude/**")).toBe(false);
  });

  // Documents a known limit rather than desired behaviour. The scanner does not recognise regex
  // literals, so an unpaired quote inside one shifts quote parity and a commented-out entry after
  // it reads as live. Neither config file this guards contains a regex literal. If that changes,
  // this test should start failing and the scanner should be replaced with a real parser.
  it("mis-tokenises after a regex literal containing an unpaired quote", () => {
    expect(hasQuotedEntry("const r = /'/; // isn't \".claude/**\"", ".claude/**")).toBe(true);
  });
});

describe("globRoots", () => {
  it("returns the leading segment of each collection pattern", () => {
    const source = [
      "include: [",
      '  "app/**/*.{test,spec}.?(c|m)[jt]s?(x)",',
      '  "components/**/*.{test,spec}.?(c|m)[jt]s?(x)",',
      '  "scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)",',
      "]",
    ].join("\n");

    expect([...globRoots(source)].sort()).toEqual(["app", "components", "scripts"]);
  });

  it("reads an array Prettier collapsed onto one line", () => {
    expect([...globRoots('include: ["app/**/*.test.ts", "scripts/**/*.test.mjs"]')].sort()).toEqual(
      ["app", "scripts"],
    );
  });

  it("ignores literals that are not patterns", () => {
    const source =
      'environment: "jsdom", include: ["app/**/*.test.ts"], setupFiles: ["./setup.ts"]';

    expect([...globRoots(source)]).toEqual(["app"]);
  });

  it("skips a commented-out pattern", () => {
    expect([...globRoots('include: ["app/**/*.test.ts"], // "components/**/*.test.ts"')]).toEqual([
      "app",
    ]);
  });

  it("returns nothing when the patterns are gone", () => {
    expect([...globRoots('environment: "jsdom"')]).toEqual([]);
  });

  // An unanchored pattern collects from the whole tree, which is the failure this guards against.
  // It yields a segment no root list contains, so the caller reports drift rather than a match.
  it.each([
    ["**/*.test.ts", "**"],
    ["/app/**/*.test.ts", ""],
    ["./app/**/*.test.ts", "."],
  ])("yields %j as the unusable root %j", (pattern, root) => {
    expect([...globRoots(`include: ["${pattern}"]`)]).toEqual([root]);
  });

  it("reports each root once", () => {
    const source = 'include: ["app/**/*.test.ts", "app/**/*.spec.ts"]';

    expect([...globRoots(source)]).toEqual(["app"]);
  });
});

describe("stringLiterals", () => {
  it("yields string values and skips comments", () => {
    const source = [
      'const a = "keep"; // "dropped"',
      '/* "also dropped" */ const b = "kept";',
    ].join("\n");

    expect([...stringLiterals(source)]).toEqual(["keep", "kept"]);
  });

  it("treats a URL inside a string as text rather than a comment", () => {
    expect([...stringLiterals('const url = "https://example.com/x";')]).toEqual([
      "https://example.com/x",
    ]);
  });

  it("handles an escaped quote inside a string", () => {
    expect([...stringLiterals('const a = "he said \\"hi\\"";')]).toEqual(['he said "hi"']);
  });
});
