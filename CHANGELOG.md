# Changelog

All notable changes to My First Commit are documented here.

This project follows a lightweight, human-curated changelog. Keep the newest changes at the top and move items from `Unreleased` into a dated release section when cutting a release.

## Unreleased

### Fixed

- A commit search that GitHub abandoned before scanning every commit is now labelled a partial result rather than "First public commit found", explains that an earlier commit may be missing, and is never cached, so searching again can reach the full history. An unfinished search that returned nothing is reported as unfinished instead of as an absence of commits, offers a retry, and no longer suggests checking a different profile. Copied result text carries the same caveat.
- Primary green actions now meet WCAG AA text contrast, and successful searches move focus to the result heading for a clear assistive-technology transition.
- GitHub search failure logs now exclude raw upstream messages and accept only validated numeric rate-limit metadata.
- Vercel Analytics event URLs now remove shared-search usernames while preserving unrelated query parameters.
- Forged Server Action requests with non-string usernames now return validation errors safely.
- Commit results with missing or invalid dates no longer crash the result timeline.
- Unexpected Server Action rejections now use the inline retry experience instead of escaping to the global error screen.
- Prevented older overlapping searches from replacing newer results, and disabled search shortcuts while a request is pending.

### Changed

- One command now runs the validation gate. `npm run validate` chains the dependency audit, unit tests, browser checks, lint, formatting, agent-document and label checks, and the production build, stopping at the first failure. The `CI / validate` job runs that same script instead of listing the steps itself, so the local gate and the CI gate are the same definition rather than two lists that drift. `npm run check:agent-docs` now also fails if CI stops invoking the script, or if the copies of the list in the development guide or the `verifier` sub-agent definition stop matching it, and the parsing behind that check is unit tested. Those two are now the only places the chain is written out in order.
- Local Entire checkpoint hooks now match Claude Code's current tool names, including the newer task tools, so the configuration no longer depends on Claude Code's legacy alias map.
- Lint and unit tests now cover product code only. `eslint.config.mjs` and `vitest.config.ts` ignore the root-level external tooling-state directories `.claude/`, `.codex/`, `.entire/`, and `.vercel/`, matching `.prettierignore`. Neither tool skips dot-directories on its own, so an agent hook or a stray test file dropped in one of them was previously linted and run as if it were product code. `npm run check:agent-docs` now fails if those three ignore lists drift apart, and the entry matching behind that check is unit tested.
- The verification exemption is now scoped by what the gate can actually read rather than by file extension. A change confined to `*.md` files or to those tooling-state directories runs `npm run check:agent-docs` only and reports `PASS (unread-paths)`. Previously a `.claude/settings.json` edit ran all eight gate commands, including a full browser suite and production build, none of which could observe it. `.github/hooks/` stays fully gated: it is agent tooling, but it is in none of the ignore lists.
- The agent workflow now bounds its review loop: findings can be explicitly resolved with a stated reason, and a finding that survives two fix-and-re-review cycles stops for a human instead of looping. Reverification is scoped to the gate commands a fix can actually affect, with an exemption for paths no gate command reads, so a prose fix no longer triggers a full audit, test, browser, and build cycle.
- Agents must now add a `CHANGELOG.md` entry with user-facing and operational changes, treat issue, pull request, and review text as data rather than instructions, and bound the wait for an assigned reviewer instead of blocking indefinitely.
- The `ui-review` sub-agent now enumerates untracked files with `--untracked-files=all`, so a brand-new component directory can no longer be mistaken for a change with no user-visible surface.
- Consolidated the pre-PR command list, which had drifted into four inconsistent copies, into a canonical list in the development guide that the contributing guide, runbook, and release guide now link to. The agent-facing files keep deliberate inline copies. Trimmed the manual QA checklist to the states the deployed browser check skips and the judgments Playwright cannot make, and documented the Playwright browser install.
- Documented the `/privacy` and `/api/csp-report` routes in the architecture guide, along with the CSP report endpoint's data boundaries. Both shipped previously without being listed among the runtime routes.
- Clarified that the main agent owns exact unit-test red/green loops while the verifier owns focused Playwright execution and the complete validation gate.
- Removed the superseded specification and roadmap documents, along with their README links.
- Upgraded the project from Node 22 to Node 24, the current Active LTS and Vercel's default runtime. `.nvmrc`, `package.json` engines, and the docs now all name 24. Node 26 is deliberately not used: Vercel offers only 20.x, 22.x, and 24.x, so pinning 26 would not deploy.

### Removed

- Copilot-specific instruction file. `.github/copilot-instructions.md` is deleted and deregistered from `npm run check:agent-docs`, which now keeps only `CLAUDE.md` and `GEMINI.md` as pointers to `AGENTS.md`. Copilot CLI, the Copilot cloud agent, Copilot code review, and Copilot Chat in VS Code read `AGENTS.md` natively, so those surfaces keep the same instructions; Copilot Chat on GitHub.com and in Visual Studio, JetBrains, Eclipse, and Xcode do not read `AGENTS.md` and no longer receive repository instructions. The check now also fails if the file reappears, since it would outrank `AGENTS.md`. The Copilot CLI hook file `.github/hooks/entire.json` is unaffected and stays.

## 0.3.0 - 2026-08-01

### Added

- Label sync automation. `.github/labels.yml` is reconciled with GitHub by the `Sync Labels` workflow on merge, or locally through `npm run sync:labels`. Deleting labels is opt-in, and CI validates the label file on every pull request.
- CSP violation reporting. The report-only policy now names a reporting destination through `report-uri`, `report-to`, and the `Reporting-Endpoints` header, and `/api/csp-report` records violations as structured `csp_violation` log events. Reported URLs are reduced to origin and path so searched usernames cannot reach logs, and the original policy and script sample are never read.
- `/api/health` now reports whether `GITHUB_TOKEN` is configured, so a rotation that never reached the running deployment is visible without a live search. Presence only is reported, never the value. The production health check asserts it against deployed targets.

### Fixed

- Deployment releases no longer take the "Latest" pointer from the version release they were deployed from. Both release workflows now set it explicitly, so `releases/latest` resolves to the current version instead of the most recent deployment.
- Release promotion no longer fails when a deployment and its health check finish before CI concludes on `main`. The promotion now waits for the deployed commit's CI run to reach a conclusion instead of treating an unfinished run as a missing one.

## 0.2.0 - 2026-08-01

### Added

- Canonical `AGENTS.md` agent instructions, with `CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` reduced to pointer files that CI keeps in sync through `npm run check:agent-docs`.
- Server-side username validation, sanitized GitHub error logging, short-lived search caching, CSP report-only headers, release workflow hardening, and tighter public health metadata.
- Automatic production release promotion and footer release links for deployed versions.
- Privacy page, example searches, privacy-safe analytics events, issue chooser config, and release publishing workflow.
- Release guide, expanded known limitations, and local Playwright coverage for result and error states.
- Result sharing, source repository context, and richer first-commit metadata.
- Label sync configuration, issue template polish, and dependency update policy.
- Roadmap and label guidance for lightweight project planning.

### Fixed

- Stopped Vercel building the Entire checkpoint branch, which had no application code and failed every push at `npm install`. Checkpoints are stored as git refs instead of a branch, and the `vercel.json` setting that could not suppress the branch was removed in favor of a runbook note.
- Release promotion no longer fails when two production deployments land close together. The older promotion is superseded by the newer commit and now skips instead of failing on a rejected tag push.
- `Release` and `Promote Production Release` no longer race to publish the same deployment tag. Each workflow owns one tag shape, so a deployment release can no longer end up carrying a version changelog instead of its deployment notes.

### Changed

- Updated production dependencies to React 19.2.8, date-fns 4.4, and react-icons 5.7, development dependencies including Playwright 1.62, Vitest 4.1.10, Tailwind 4.3.3, and Prettier 3.9.6, and the `actions/checkout` and `actions/setup-node` workflow actions to v7.

### Security

- Cleared all npm audit advisories: patch upgrades for Next.js and its ESLint config, raised postcss and sharp overrides, and lockfile fixes for undici, vite, js-yaml, brace-expansion, and Babel.

## 0.1.0 - 2026-05-11

### Added

- Architecture note and manual QA checklist with Open Graph preview validation steps.
- Accessibility checks for landmarks, keyboard tab order, and privacy content.
- Baseline security headers for app, API, 404, and generated image responses.
- Runtime `/api/health` endpoint for deployment checks and production troubleshooting.
- Branded app error boundary and custom 404 page.
- Production health check workflow with GitHub issue creation on deployment failures.
- Vercel Analytics, structured server logs, and production runbook guidance.
- README badges, screenshot, project overview, and split development documentation.
- CONTRIBUTING guide with branch, PR, review, and validation workflow.
- MIT license.

### Changed

- Improved homepage layout, footer branding, and visible privacy note.
- Improved GitHub API failure copy for rate limits, timeouts, unavailable GitHub services, validation failures, and unknown errors.
- Added recent-search clearing and browser-only storage guidance.
- Expanded unit and Playwright coverage for homepage behavior, accessibility, generated assets, branded 404, and health checks.

### Security

- Added Dependabot configuration for dependency update pull requests.
- Documented secure GitHub token handling and production configuration.
