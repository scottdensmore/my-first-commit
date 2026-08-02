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
npm test && npm run lint && npm run format:check && npm run check:agent-docs && npm run check:labels && npm run build && npm run test:e2e
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
  usernames `e2e-result`, `e2e-empty`, `e2e-rate-limit`, and `e2e-unavailable`. Playwright sets this
  automatically and runs the app on port **3100**, not 3000. Add new fixture cases in `app/actions.ts`
  when adding browser coverage for a new state.
- **Prettier ignores `*.md`.** Prose is formatted by hand. Do not run the formatter over docs, and do
  not reflow markdown as part of an unrelated change.
- **The commit cache is per-process.** It is a plain `Map`, so it resets on every serverless cold
  start and is not shared between instances. Never treat it as durable storage.
- **Logging is sanitized on purpose.** `app/logger.ts` takes an event name plus scalar fields. Never
  log usernames, tokens, or raw Octokit error objects.
- **`GITHUB_TOKEN` is server-only.** Never expose it as a `NEXT_PUBLIC_*` variable. The app works
  unauthenticated but hits GitHub search rate limits quickly.
- **Recent searches live only in the browser**, under `my-first-commit:recent-searches`.

## Conventions

- Node 22 (`.nvmrc`). Import alias `@/*` resolves to the repo root.
- Branch names: `<your-github-handle>/<type>/<short-description>`.
- PR titles use Conventional Commits, for example `feat(app): add runtime health endpoint`.
- One logical change per PR, roughly 400 changed lines or fewer.
- Add unit tests with the change, plus Playwright coverage for user-visible flows when practical.

## More Detail

- [docs/architecture.md](docs/architecture.md) — request flow, data boundaries, failure handling
- [docs/development.md](docs/development.md) — setup, env vars, validation, dependency policy
- [docs/production.md](docs/production.md) — production runbook and troubleshooting
- [CONTRIBUTING.md](CONTRIBUTING.md) — branch, PR, and review workflow
