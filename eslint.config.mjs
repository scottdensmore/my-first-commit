import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The coverage reporter's own HTML assets, matching .prettierignore and .gitignore. They are
    // vendored scripts rather than project source, and one of them carries an eslint-disable
    // directive this config has nothing to disable, so a local coverage run used to leave `npm run
    // lint` reporting a warning about a generated file.
    "coverage/**",
    // Tooling state managed by external agent tools, matching .prettierignore. Flat config does
    // not skip dot-directories on its own, so without these an agent hook or script dropped here
    // would be linted as project source.
    ".claude/**",
    ".codex/**",
    ".entire/**",
    ".vercel/**",
  ]),
]);

export default eslintConfig;
