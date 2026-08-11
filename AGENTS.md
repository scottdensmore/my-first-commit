# Agent Instructions

Canonical instructions for coding agents working in this repository. `CLAUDE.md`, `GEMINI.md`, and
`.github/copilot-instructions.md` are pointers to this file and must stay pointers. Add project
context here, never in the pointer files. CI enforces this with `npm run check:agent-docs`.

## Project

My First Commit is a Next.js 16 App Router app (React 19, Tailwind 4, TypeScript strict). A visitor
enters a GitHub handle and sees that user's first public commit plus the nine that followed. There
is no database, no accounts, and no server-side storage of searches.

## Commands

```bash
npm run dev              # localhost:3000
npm audit                # dependency vulnerability gate
npm test                 # vitest run (jsdom)
npm run test:watch
npm run lint             # eslint
npm run format           # prettier --write
npm run format:check     # prettier --check (CI gate)
npm run check:agent-docs # verify agent pointer files have not drifted
npm run check:labels     # validate .github/labels.yml
npm run sync:labels      # reconcile GitHub labels with .github/labels.yml
npm run build
npm run test:e2e         # playwright; boots its own dev server on :3100
```

Full pre-PR validation, matching the `CI / validate` job:

```bash
npm audit && npm test && npm run test:e2e && npm run lint && npm run format:check && npm run check:agent-docs && npm run check:labels && npm run build
```

## Layout

- `app/page.tsx` — homepage shell
- `app/actions.ts` — `getCommits` server action; Octokit search plus error normalization
- `app/commitSearchCache.ts` — in-memory TTL cache (5 minutes, 100 entries)
- `app/username.ts` — validation and normalization, used on both the client and the server action
- `app/logger.ts` — structured warn/error logging
- `app/home/` — homepage search internals (hook, form, results, recent searches, analytics)
- `app/api/health/route.ts` — runtime health JSON for production checks
- `components/FirstCommitDisplay.tsx` — result timeline rendering
- `tests/e2e/` — Playwright specs; unit tests are colocated as `*.test.ts(x)`

## Gotchas

- **E2E mocks.** `E2E_COMMIT_SEARCH_MOCKS=1` makes `app/actions.ts` return fixtures for the reserved
  usernames `e2e-result`, `e2e-slow-result`, `e2e-reject-once-*`, `e2e-malformed-dates`,
  `e2e-empty`, `e2e-rate-limit`, and `e2e-unavailable`. Playwright sets this automatically and runs
  the app on port **3100**, not 3000. Add new fixture cases in `app/actions.ts` when adding browser
  coverage for a new state.
- **Prettier ignores `*.md`.** Prose is formatted by hand. Do not run the formatter over docs, and do
  not reflow markdown as part of an unrelated change.
- **The commit cache is per-process.** It is a plain `Map`, so it resets on every serverless cold
  start and is not shared between instances. Never treat it as durable storage.
- **Logging is sanitized on purpose.** `app/logger.ts` takes an event name plus scalar fields. Never
  log usernames, tokens, or raw Octokit error objects.
- **`GITHUB_TOKEN` is server-only.** Never expose it as a `NEXT_PUBLIC_*` variable. The app works
  unauthenticated but hits GitHub search rate limits quickly.
- **Recent searches live only in the browser**, under `my-first-commit:recent-searches`.

## Development workflow (required)

1. **Inspect before changing anything.** Inspect the repository, current Git state, and all
   applicable instruction files before making changes. Preserve unrelated staged, unstaged, and
   untracked work.

2. **Create a branch first.** Create a dedicated feature, fix, refactor, chore, test, or
   documentation branch before making code changes. Never commit directly to `main`, and create the
   branch from the latest appropriate `main` state.

3. **Choose a thin vertical slice.** Before implementing a tracked issue or feature, define the
   smallest end-to-end slice that can be reviewed, tested, shipped, and merged independently.
   Prefer one coherent user-visible or operational outcome over a broad horizontal layer. If the
   next issue is too large for one pull request, split it into ordered slices and complete only the
   current slice. Keep pull requests small enough for thorough review, reliable verification, and
   quick rollback.

4. **Use test-driven development when behavior or structure is testable.**
   - The main agent adds or updates a focused test before implementation.
   - For unit coverage, the main agent runs only the exact test it authored or changed, filtered by
     file and test name, and confirms that it fails for the expected reason.
   - For user-journey coverage, the main agent authors the focused Playwright test and invokes the
     `verifier` to run that exact journey and report the expected failure concisely.
   - Implement the smallest appropriate change.
   - Repeat the same focused unit test in the main agent and focused journey in the `verifier` until
     each passes. Do not substitute focused checks for the complete verification gate in step 7.
   - Refactor only while the relevant tests remain green.
   - The main agent must not run whole test files or suites, Playwright, dependency audits, lint,
     formatting checks, agent-document or label checks, or production builds. Those commands belong
     to the `verifier`, keeping routine command output out of the main implementation context.

5. **Inspect the complete diff.** Review the branch diff plus all staged, unstaged, and untracked
   files. Remove accidental or unrelated changes while preserving work that belongs to the user.

6. **Run `ui-review` before verification.** After the main agent completes an implementation pass,
   invoke the `ui-review` sub-agent. The reviewer must act as an expert in responsive web apps,
   accessibility, React, and modern product design. For changes with no user-visible surface, it
   should say so and return without inventing findings.

7. **Run `verifier` before code review.** Invoke the `verifier` sub-agent to run the dependency
   audit, complete unit and Playwright suites, static checks, production build, and journey coverage
   appropriate for the change. Focused Playwright runs performed during TDD do not replace this
   complete pass. The verifier must report successes concisely and include only the failure evidence
   needed to diagnose failures, flakes, missing coverage, and environment issues. Fix or explicitly
   resolve every actionable finding before starting code review. If a verifier finding requires a
   code change, the main agent reruns only the exact affected unit regressions, the verifier reruns
   affected focused journeys when needed, and then the verifier reruns the complete gate.

8. **Run `code-review` before every commit.** Invoke the `code-review` sub-agent against the current
   branch diff and every staged, unstaged, and untracked file. The reviewer must act as an expert in
   TypeScript, React, Next.js App Router, Tailwind CSS, Vitest, and Playwright. Address every
   actionable finding before committing. If review findings cause changes, the main agent reruns
   only the exact affected unit regressions, then the `verifier` reruns any affected focused journeys
   and the complete gate before a fresh `code-review` approval for the changed state.

9. **Commit after approval.** Commit only after verification and code review are complete. Use
   Conventional Commits:

   ```text
   <type>(<scope>): <imperative summary>
   ```

   Keep the subject at 72 characters or fewer, describe why in the body when useful, and do not
   combine unrelated work.

10. **Create pull requests from the reviewed state.**
    - Confirm that local verification remains valid.
    - Rerun `code-review` only if the reviewed state changed after the pre-commit review.
    - A changed state includes code, tests, documentation, generated files, conflict resolution,
      or any other staged, unstaged, or untracked content.
    - Do not repeat code review when the already-reviewed diff and worktree remain unchanged.
    - Push and create the pull request only after local verification and any required code review
      are complete.
    - Open a normal, ready-for-review pull request by default. Do not open draft pull requests unless
      the user explicitly asks for a draft.

11. **Merge only clean, passing pull requests.** Merge only after GitHub reports a clean merge state
    and every configured check passes. Never bypass a failing or pending required check. Use squash
    merge for short-lived development branches to keep `main` linear, then delete the merged branch.
    - **Check for an assigned reviewer before merging.** After opening the pull request, check whether
      a reviewer or team was assigned by repository rules, automation, or a human. Use `gh pr view
      <n> --json reviewRequests,reviews` to see both pending requests and submitted reviews.
    - **If a reviewer is assigned, wait for the review.** Do not merge a pull request that has a
      review pending, even when every check is green. Address the feedback, push the fixes, and let
      the reviewer see the updated state.
    - Self-merges are allowed only when no reviewer is assigned and the conditions above are met.

### Sub-agents

Steps 6-8 use sub-agents defined in `.claude/agents/`:

| Sub-agent | Role |
| --- | --- |
| `ui-review` | Web product design review: responsive layout, interaction, accessibility, and visual quality. |
| `verifier` | Runs focused Playwright journeys during TDD, then the complete repository validation gate, and reports concise evidence. |
| `code-review` | Expert review of the branch diff and all uncommitted files. |

**Invoke the `code-review` sub-agent, so the loop does not stall.** An agent's own review command may
need the user to trigger it, which stops a workflow that should otherwise run unattended. Use the
sub-agent and keep going. Either way, cover the scope step 8 asks for: the branch diff plus every
staged, unstaged, and untracked file. Plain `git status --short` can collapse a new untracked
directory to one entry, so use `--untracked-files=all` to see the files inside it.

Agents that cannot invoke sub-agents must perform the equivalent work themselves and say so
explicitly rather than skipping the step.

## Conventions

- Node 24 (`.nvmrc`). Import alias `@/*` resolves to the repo root.
- Branch names: `<your-github-handle>/<type>/<short-description>`.
- PR titles use Conventional Commits, for example `feat(app): add runtime health endpoint`.
- One logical change per PR, roughly 400 changed lines or fewer.
- Add unit tests with the change, plus Playwright coverage for user-visible flows when practical.

## More Detail

- [docs/architecture.md](docs/architecture.md) — request flow, data boundaries, failure handling
- [docs/development.md](docs/development.md) — setup, env vars, validation, dependency policy
- [docs/production.md](docs/production.md) — production runbook and troubleshooting
- [CONTRIBUTING.md](CONTRIBUTING.md) — branch, PR, and review workflow
