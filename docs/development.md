# Development Guide

This guide covers local setup, configuration, validation, deployment, and maintenance for My First Commit.

## Prerequisites

- Node.js 24
- npm

## Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd my-first-commit
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

## Configuration

The app works out of the box using unauthenticated GitHub API requests. GitHub applies a strict rate limit to unauthenticated search requests, so a token is recommended for local and production use.

Create `.env.local` in the project root:

```env
GITHUB_TOKEN=your_github_pat_here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`GITHUB_TOKEN` is server-side only. Do not expose it as a `NEXT_PUBLIC_*` variable.

## Running Locally

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Validation

Run the complete gate with one command before opening a pull request:

```bash
npm run validate
```

The `CI / validate` job runs this same script, so there is one definition of the gate rather than a
local list and a CI list that can drift apart. It runs these commands in order and stops at the first
failure:

```bash
npm audit                # dependency vulnerability gate
npm run test:coverage    # vitest run (jsdom) with V8 coverage and its thresholds
npm run test:e2e         # playwright; boots its own dev server on :3100 (E2E_PORT to override)
npm run lint             # eslint
npm run format:check     # prettier --check
npm run check:agent-docs # agent pointer files, tooling ignore lists, and this gate list
npm run check:labels     # .github/labels.yml
npm run build            # production build
```

Run individual commands while developing; run `npm run validate` before pushing. The contributing
guide, runbook, and release guide link here rather than keeping their own copies.

The expanded list above and the copy in the `verifier` sub-agent definition in `.claude/agents/` are
the only two places the chain is written out in order. The verifier keeps its own copy because agents
follow instructions better than links, and because it needs the individual commands for the scoped
reruns in [AGENTS.md](../AGENTS.md) step 7. Both copies are checked against the `validate` script by
`npm run check:agent-docs`, which also fails if CI stops invoking that script, so neither the docs
nor CI can drift from the gate silently. The `## Commands` catalogue in `AGENTS.md` lists the same
commands individually, but as a reference of what each one does rather than as the ordered gate.

`npm run check:agent-docs` keeps [AGENTS.md](../AGENTS.md) the single source of agent instructions.
`CLAUDE.md` and `GEMINI.md` must stay byte-for-byte pointers to it, so notes captured by a coding
agent (for example Claude Code's `#` shortcut) do not quietly accumulate in a tool-specific file.
Move the content into `AGENTS.md`, then run `npm run check:agent-docs -- --fix` to restore the
pointers.

`npm run check:labels` validates `.github/labels.yml` offline, without a token or network access. See
[labels](labels.md) for syncing labels to GitHub.

Playwright needs its browser binaries once per machine, and again after a Playwright version bump.
These are the same browsers CI installs:

```bash
npx playwright install --with-deps chromium webkit
```

WebKit needs system libraries Chromium does not. `--with-deps` installs them and needs `sudo`; on
a machine where the browsers are already present, `sudo npx playwright install-deps webkit` adds
just the libraries. WebKit downloads but refuses to launch without them, so the symptom is a
missing-dependencies error at launch rather than a failed download.

### Browser projects

The suite runs three, and two of them are deliberately selective so extra coverage costs a few
runs rather than tripling the suite:

| Project | Engine | Viewport | Runs |
| --- | --- | --- | --- |
| `chromium` | Desktop Chrome | 1280×720 | every spec |
| `mobile-chrome` | Chromium (Galaxy S9+) | 320×658 | specs tagged `@mobile` |
| `webkit` | Desktop Safari | 1280×720 | specs tagged `@webkit` |

Tag with `test("name", { tag: ["@mobile"] }, ...)`. Tag a spec when the extra project changes
something it actually exercises — viewport and touch for mobile, a different engine for WebKit.
320px is both the narrowest realistic phone and what 200% zoom produces on a 640px window, which
is the WCAG 1.4.10 reflow condition.

One constraint worth knowing before tagging: **Playwright cannot grant clipboard permissions on
WebKit**, so a spec calling `context.grantPermissions` with a clipboard permission must stay
untagged. The copy path is covered on WebKit by a separate spec that asserts the visitor always
gets an answer rather than asserting one particular outcome.

Run one project with `npx playwright test --project=webkit`.

If that download is blocked by network policy, `npm run test:e2e` cannot run locally. Because it is
third in the chain, `npm run validate` then stops there and never reaches lint, formatting, the
document and label checks, or the build. Run the remaining commands individually, and report which
ones ran rather than treating the gate as passed.

Run the local browser health check:

```bash
npm run test:e2e
```

Local Playwright runs start the app with `E2E_COMMIT_SEARCH_MOCKS=1` so result and error-state coverage is deterministic and does not depend on GitHub search availability. They use port 3100, not 3000, so the check does not collide with `npm run dev`. Set `E2E_PORT` to run on a different port when 3100 is already taken.

Before any spec runs, a global setup asks `/api/health` on that port whether it is this application. Playwright's `reuseExistingServer` only checks that the port answers, so an unrelated app left running there would otherwise be adopted and every spec would fail against the wrong site. The run now stops with one error naming the port and what was found there — a different service, an unexpected status, an unreadable response, a dropped connection, or silence.

Identity alone would let a stale server through, so a second probe follows it. A server of this app left on the port by an interrupted run answers the identity probe perfectly, and if that run started it without `E2E_COMMIT_SEARCH_MOCKS=1` every reserved `e2e-*` username reaches real GitHub and nearly every spec fails for a reason that has nothing to do with the branch. `/api/e2e-readiness` reports whether the fixture mocks are on, and the run stops naming the flag when they are not. A server too old to serve that route, or a production build where it is deliberately absent, is rejected the same way.

That route exists for this check alone. It reports one boolean and returns `404` whenever `NODE_ENV` is `production`, so it is absent from `next start` and from every Vercel deployment, preview included. `/api/health` is public and uncached and its ceiling is what a production operator needs; a flag about test configuration would be harmless there today only because it is never set in production, and that is not a precedent worth setting for the next flag.

Neither probe checks which branch the server is running, so a stale server of the right shape from another checkout still passes. Stop it and let Playwright start its own if a run looks inexplicably wrong.

Playwright starts or adopts its web server before that hook runs, so the check reports the problem rather than preventing the connection. That is enough: it turns a suite-wide wall of misleading failures into one accurate error in a few seconds. It never stops the other process — the port may belong to another checkout or another person's work.

The worker count is set rather than derived from the machine, so the same checkout behaves the same way on any laptop or agent sandbox: 4 locally, and 2 under `CI`, which is what GitHub's 4-vCPU runners were already getting from Playwright's half-the-CPUs default. Set `E2E_WORKERS` to investigate a concurrency-sensitive failure; values outside 1–64 are rejected. Both overrides reject an unusable value rather than falling back silently — Playwright accepts a `NaN` worker count and then hangs with no output at all.

Run the browser health check against production:

```bash
npm run test:e2e:deployed
```

Or point the health check at any deployed URL:

```bash
PLAYWRIGHT_BASE_URL=https://your-deployment.example npm run test:e2e
```

For active test-driven development:

```bash
npm run test:watch
```

### Coverage

The unit step of the gate runs with V8 coverage, so coverage is measured once, locally and in CI,
by the same command:

```bash
npm run test:coverage    # vitest run --coverage
```

The text summary prints in the terminal and an HTML report lands in `coverage/`, which Git,
Prettier, and ESLint all ignore. `npm test` still runs the suite without instrumenting it, which is
the faster loop for a single file.

Thresholds live in `vitest.config.mts` and are a **non-regression floor**, not a target:

| Metric | Floor | Measured |
| --- | --- | --- |
| Statements | 93% | 93.71% |
| Branches | 89% | 89.73% |
| Functions | 98% | 98.38% |
| Lines | 94% | 94.65% |

Under a point of slack means a refactor does not fail on rounding while a few newly uncovered lines
do. Raise the floors when a deliberate push moves the numbers up; do not lower one to make a change
pass.

**Coverage measures the collection roots, not just the files the suite loads.** That matters because
on Vitest's default scope a module no test imports is *absent* from the report rather than counted as
zero, so the floors would catch coverage falling in already-tested code and miss code arriving
untested. Scoped, a wholly untested new module drops the number and fails the gate.

Seven files are excluded, each one the gate covers by running rather than by importing: the three
metadata image routes, which `next build` prerenders and a browser spec asserts return PNGs; and the
four CLI shells, which `npm run check:agent-docs`, `npm run check:labels`, and the production
workflows execute. Each is a thin shell over a module that is unit tested. Add to that list only
when another gate command genuinely covers the file, and record which one — excluding a file that
nothing covers is how a floor starts reporting a hole that is not there.

Without those exclusions the same scope reads 74.49%, and all of the gap is those seven files.

## Deployment

This is a standard Next.js app and can be deployed to Vercel or any host that supports Next.js with Node.js 24.

Required production build command:

```bash
npm run build
```

Recommended production environment variables:

```env
GITHUB_TOKEN=your_github_pat_here
NEXT_PUBLIC_SITE_URL=https://my-first-commit-eta.vercel.app
```

Production deployments trigger the `Production Health Check` GitHub Actions workflow. Set the `PRODUCTION_BASE_URL` GitHub Actions repository variable to the public production URL:

```env
PRODUCTION_BASE_URL=https://my-first-commit-eta.vercel.app
```

See the [production runbook](production.md) for deployment checks, observability, and troubleshooting.
See the [release guide](release.md) for the release checklist, tag, and GitHub release workflow.

## Maintenance Workflow

- Open feature, fix, and maintenance work as pull requests.
- Keep PRs focused and wait for CI, the Vercel preview, and any review requested on the pull request.
- Use the issue templates for bugs, feature ideas, and maintenance tasks.
- Merge dependency updates one at a time when possible.

## Dependency Update Policy

Dependabot opens weekly patch and minor updates for npm packages and GitHub Actions. Major npm version updates are intentionally ignored by Dependabot because they often need compatibility review.

For dependency pull requests:

1. Merge one dependency PR at a time when possible.
2. Confirm CI and Vercel preview are green.
3. Review `package-lock.json` for unrelated churn.
4. Check release notes for packages that touch Next.js, React, Octokit, Playwright, or Vercel.

For major upgrades:

1. Open a dedicated maintenance issue or PR.
2. Read the migration guide or release notes first.
3. Upgrade the package and lockfile together.
4. Run `npm run validate`, the full [validation suite](#validation).
5. Update docs, runbook notes, or the changelog when behavior, commands, Node requirements, or deployment assumptions change.
