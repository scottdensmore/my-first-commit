import { afterEach, describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyVendoredBraces } from "./check-vendored-braces.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const installed = () => ({
  braces: require("braces"),
  version: require("braces/package.json").version,
});
const temporary = [];

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "vendored-braces-"));
  temporary.push(directory);
  mkdirSync(join(directory, "vendor"));
  for (const file of ["package.json", "package-lock.json", "vendor/braces-3.0.4.tgz"]) {
    copyFileSync(join(root, file), join(directory, file));
  }
  return directory;
}

function editJson(directory, file, edit) {
  const value = JSON.parse(readFileSync(join(directory, file), "utf8"));
  edit(value);
  writeFileSync(join(directory, file), JSON.stringify(value));
}

afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("vendored braces security contract", () => {
  it("checks the actual installed patch, normal expansion and non-bypassable depth limit", () => {
    expect(() => verifyVendoredBraces(root)).not.toThrow();
  });

  it("rejects the relative override that failed beneath micromatch", () => {
    const directory = fixture();
    editJson(directory, "package.json", (value) => {
      value.overrides.braces = "file:vendor/braces-3.0.4.tgz";
    });
    expect(() => verifyVendoredBraces(directory, installed)).toThrow();
  });

  it("rejects a changed archive even if a package still calls itself 3.0.4", () => {
    const directory = fixture();
    writeFileSync(join(directory, "vendor/braces-3.0.4.tgz"), "not the reviewed patch");
    expect(() => verifyVendoredBraces(directory, installed)).toThrow();
  });

  it.each(["version", "resolved", "integrity"])("rejects lockfile %s drift", (field) => {
    const directory = fixture();
    editJson(directory, "package-lock.json", (value) => {
      value.packages["node_modules/braces"][field] = "changed";
    });
    expect(() => verifyVendoredBraces(directory, installed)).toThrow();
  });

  it("rejects a lockfile with no patched package", () => {
    const directory = fixture();
    editJson(directory, "package-lock.json", (value) => {
      delete value.packages["node_modules/braces"];
    });
    expect(() => verifyVendoredBraces(directory, installed)).toThrow();
  });

  it("rejects an installed package without the depth guard", () => {
    const original = installed();
    expect(() =>
      verifyVendoredBraces(root, () => ({
        version: original.version,
        braces: { expand: original.braces.expand, parse: () => ({}) },
      })),
    ).toThrow();
  });
});
