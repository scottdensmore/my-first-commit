import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ARCHIVE_URL =
  "https://raw.githubusercontent.com/scottdensmore/my-first-commit/03ff3e222cab6e2534b94d2eca7a2698b8ae53a0/vendor/braces-3.0.4.tgz";
const ARCHIVE_SHA256 = "29a27e41ae63e7ef854142e56ec65d1981e4b34728173eedd7730a131ab580a9";

export function verifyVendoredBraces(root, loadInstalled) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  const archive = readFileSync(join(root, "vendor/braces-3.0.4.tgz"));
  assert.equal(createHash("sha256").update(archive).digest("hex"), ARCHIVE_SHA256);
  const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
  assert.equal(manifest.overrides.braces, ARCHIVE_URL);
  const entries = Object.entries(lock.packages).filter(([name]) =>
    /(^|\/)node_modules\/braces$/.test(name),
  );
  assert.ok(entries.length > 0, "The lockfile must include the patched braces package");
  for (const [name, entry] of entries) {
    assert.equal(entry.version, "3.0.4", `${name} must retain the security patch`);
    assert.equal(entry.resolved, ARCHIVE_URL, `${name} must resolve independently of its parent`);
    assert.equal(entry.integrity, integrity, `${name} must retain the archive integrity`);
  }
  const require = createRequire(join(root, "package.json"));
  const { braces, version } = loadInstalled
    ? loadInstalled()
    : { braces: require("braces"), version: require("braces/package.json").version };
  assert.equal(version, "3.0.4");
  assert.deepEqual(braces.expand("file{1..3}.txt"), ["file1.txt", "file2.txt", "file3.txt"]);
  for (const [open, close] of [
    ["{", "}"],
    ["(", ")"],
  ]) {
    const nested = open.repeat(200) + "a" + close.repeat(200);
    assert.throws(() => braces.parse(nested), /exceeds max depth/);
    assert.throws(() => braces.parse(nested, { maxDepth: Infinity }), /exceeds max depth/);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyVendoredBraces(join(dirname(fileURLToPath(import.meta.url)), ".."));
  console.log("Vendored braces integrity, immutable resolution and installed depth guard passed.");
}
