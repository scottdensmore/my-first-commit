# Contributing

Thanks for helping improve My First Commit. Keep changes small, tested, and easy to review.

## Workflow

1. Start from the latest `main`.
2. Create a focused branch. When working directly in this repository, use your GitHub handle as a branch prefix:

   ```bash
   git checkout main
   git pull
   git checkout -b <your-github-handle>/<type>/<short-description>
   ```

3. Make one logical change per pull request.
4. Add or update tests with the change. New behavior should include unit coverage, and user-visible flows should include Playwright coverage when practical.
5. Run validation before opening a PR:

   ```bash
   npm test
   npm run lint
   npm run build
   npm run test:e2e
   ```

6. Open a pull request into `main`.
7. Wait for CI, Vercel preview, and Copilot review.
8. Address review comments before merging.

## Pull Requests

- Keep PRs focused and under roughly 400 changed lines when practical.
- Use Conventional Commit style for titles, for example `feat(app): add runtime health endpoint`.
- Include what changed, why it changed, and how it was tested.
- Do not include secrets, debug statements, or unrelated formatting churn.

## Dependency Updates

Dependabot opens dependency PRs. Review and merge them one at a time when possible, after CI passes.

## Production Checks

After a PR merges to `main`, Vercel deploys production and GitHub Actions runs the production health check against the public app URL.

Use the [production runbook](docs/production.md) for deployment checks, observability, and troubleshooting.
Use the [manual QA checklist](docs/manual-qa.md) for larger UI, metadata, or release-verification changes.
