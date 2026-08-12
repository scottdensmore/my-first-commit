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

This is the canonical pre-PR command list. It matches the `CI / validate` job in
`.github/workflows/ci.yml`. The contributing guide, runbook, and release guide link here rather than
keeping their own copies. Two agent-facing files keep deliberate inline copies, because agents follow
instructions better than links: [AGENTS.md](../AGENTS.md#commands) and the `verifier` sub-agent
definition in `.claude/agents/`. Keep all three in step when CI changes.

```bash
npm audit
npm test
npm run test:e2e
npm run lint
npm run format:check
npm run check:agent-docs
npm run check:labels
npm run build
```

`npm run check:agent-docs` keeps [AGENTS.md](../AGENTS.md) the single source of agent instructions.
`CLAUDE.md`, `GEMINI.md`, and `.github/copilot-instructions.md` must stay byte-for-byte pointers to
it, so notes captured by a coding agent (for example Claude Code's `#` shortcut) do not quietly
accumulate in a tool-specific file. Move the content into `AGENTS.md`, then run
`npm run check:agent-docs -- --fix` to restore the pointers.

`npm run check:labels` validates `.github/labels.yml` offline, without a token or network access. See
[labels](labels.md) for syncing labels to GitHub.

Playwright needs its browser binaries once per machine, and again after a Playwright version bump.
These are the same browsers CI installs:

```bash
npx playwright install --with-deps chromium
```

If that download is blocked by network policy, `npm run test:e2e` cannot run locally. Report which
gate commands could not run rather than treating the gate as passed.

Run the local browser health check:

```bash
npm run test:e2e
```

Local Playwright runs start the app with `E2E_COMMIT_SEARCH_MOCKS=1` so result and error-state coverage is deterministic and does not depend on GitHub search availability. They use port 3100, not 3000, so the check does not collide with `npm run dev`.

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
4. Run the full [validation suite](#validation).
5. Update docs, runbook notes, or the changelog when behavior, commands, Node requirements, or deployment assumptions change.
