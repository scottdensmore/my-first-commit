// Reads which browser engines the Playwright suite needs, and which ones a workflow installs.
//
// Used by check-agent-docs.mjs. Two workflows run the browser suite and each writes its own
// install list by hand. Nothing kept those lists in step with playwright.config.ts, so adding the
// `webkit` project updated one workflow and not the other, and the mismatch surfaced as a failed
// production health check after a deploy — the most expensive place for it to fail, and one no
// local command reaches, since that workflow only runs on a production deployment_status.
//
// Scope: a tripwire over the source text, like ignore-entries.mjs, not an evaluation of the
// config. It cannot know what a computed project name or a spread variable resolves to, so it
// fails loudly on anything it does not recognise rather than assuming the safe answer. A check
// that guesses here would go quiet exactly when the config grew the construct it could not read.

/** Every browser Playwright can install. A project must resolve to one of these. */
const ENGINES = ["chromium", "firefox", "webkit"];

/**
 * The engines `playwright.config.ts` declares projects for.
 *
 * The mapping is project -> engine, never project -> name. `mobile-chrome` is a Chromium project
 * using the Galaxy S9+ descriptor, so a name-based reading would demand a browser called
 * "mobile-chrome" that does not exist, and would miss that it needs chromium.
 *
 * Two spellings are recognised, which are the two this config uses:
 *   - `devices["Desktop Safari"]` — resolved through `deviceEngines`, supplied by the caller so
 *     this module does not import Playwright itself.
 *   - `browserName: "webkit"` — used directly.
 *
 * Throws when a project resolves to neither. That is deliberate: silently skipping an unreadable
 * project would let a new one ship with no workflow installing its browser, which is the exact
 * failure this module exists to prevent.
 */
export function requiredEngines(source, deviceEngines) {
  const projectsBlock = projectsArray(source);

  if (projectsBlock === null) {
    throw new Error("playwright.config.ts has no `projects:` array to read.");
  }

  const engines = new Set();

  for (const [, deviceName] of projectsBlock.matchAll(/devices\[\s*["']([^"']+)["']\s*\]/g)) {
    const engine = deviceEngines[deviceName];

    if (engine === undefined) {
      throw new Error(
        `playwright.config.ts uses the device "${deviceName}", which Playwright does not define. ` +
          `Its engine cannot be resolved, so the browsers a workflow must install cannot be checked.`,
      );
    }

    engines.add(engine);
  }

  for (const [, engine] of projectsBlock.matchAll(/browserName:\s*["']([^"']+)["']/g)) {
    if (!ENGINES.includes(engine)) {
      throw new Error(`playwright.config.ts names an unknown browser "${engine}".`);
    }

    engines.add(engine);
  }

  if (engines.size === 0) {
    throw new Error(
      "No project in playwright.config.ts resolves to a browser. Projects are recognised by a " +
        "`devices[...]` descriptor or a `browserName` property; teach this check the new spelling " +
        "rather than removing it.",
    );
  }

  return engines;
}

/**
 * The text of the `projects: [ ... ]` array, or null when there is none.
 *
 * Bracket counting rather than a lazy regex: a project's `use` object contains brackets of its
 * own, so matching to the first `]` would stop inside the first project and silently under-report
 * the rest. Brackets inside strings are not discounted, which is safe here because a device name
 * cannot contain one; if that stops being true, this needs the scanner from ignore-entries.mjs.
 */
function projectsArray(source) {
  const start = source.indexOf("projects:");
  if (start === -1) return null;

  const open = source.indexOf("[", start);
  if (open === -1) return null;

  let depth = 0;

  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "[") depth += 1;
    if (source[index] === "]") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }

  return null;
}

/**
 * Whether a workflow runs the browser suite, directly or through the gate.
 *
 * Both spellings count. `npm run test:e2e` is the production health check; `npm run validate`
 * chains the suite as its third command. Checking only the first would have passed the workflow
 * that actually broke.
 */
export function runsBrowserSuite(workflowSource) {
  return /npm run (test:e2e|validate)\b/.test(workflowSource);
}

/**
 * The browsers a workflow's `playwright install` step names.
 *
 * Returns an empty set when the workflow installs Playwright without naming any browser, which
 * installs all of them and therefore satisfies any requirement — reported separately by the
 * caller rather than confused with "installs nothing", which is the opposite situation.
 */
export function installedBrowsers(workflowSource) {
  const installs = [...workflowSource.matchAll(/npx playwright install([^\n]*)/g)];

  if (installs.length === 0) return null;

  const browsers = new Set();
  let namesAny = false;

  for (const [, rest] of installs) {
    for (const word of rest.split(/\s+/)) {
      if (ENGINES.includes(word)) {
        browsers.add(word);
        namesAny = true;
      }
    }
  }

  return namesAny ? browsers : new Set();
}
