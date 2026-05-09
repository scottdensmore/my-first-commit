# Production Runbook

This runbook covers the production checks and levers for My First Commit.

## Production URLs

- Public app: https://my-first-commit-eta.vercel.app
- GitHub repository: https://github.com/scottdensmore/my-first-commit

Use the public app URL for smoke tests. Vercel's generated deployment URLs can be protected and may return `401`.

## Required Configuration

Vercel environment variables:

```env
GITHUB_TOKEN=your_github_pat_here
NEXT_PUBLIC_SITE_URL=https://my-first-commit-eta.vercel.app
```

GitHub Actions repository variables:

```env
PRODUCTION_BASE_URL=https://my-first-commit-eta.vercel.app
```

`GITHUB_TOKEN` is server-side only. Do not expose it as a public `NEXT_PUBLIC_*` variable.

## Deployment Flow

1. Merge a green PR into `main`.
2. GitHub Actions runs `CI / validate`.
3. Vercel builds and deploys production.
4. GitHub receives a production `deployment_status` event.
5. The `Deployed Smoke` workflow runs Playwright against `PRODUCTION_BASE_URL`.

The production deploy is healthy when both `CI / validate` and `Deployed Smoke` pass on `main`.

## Production Smoke Alerts

When `Deployed Smoke` fails, GitHub Actions opens or updates a GitHub issue titled:

```text
Production smoke test failed
```

Use that issue as the incident record. It includes the smoke target, workflow run, and commit SHA.

When responding to a smoke failure:

1. Open the workflow run linked from the issue.
2. Confirm the smoke target is the public production URL.
3. Open production manually and check whether the app renders.
4. Fix the deployment, configuration, or app regression.
5. Re-run `Deployed Smoke` or deploy a fix.
6. Close the issue after production smoke passes again.

## Manual Validation

Run the core checks locally:

```bash
npm audit
npm test
npm run lint
npm run build
npm run test:e2e
```

Run a smoke test against production:

```bash
npm run test:e2e:deployed
```

Run a smoke test against any deployed URL:

```bash
PLAYWRIGHT_BASE_URL=https://your-deployment.example npm run test:e2e
```

You can also start `Deployed Smoke` manually from GitHub Actions. Provide the public app URL as `base_url`.

## Observability

### Vercel Analytics

Use Vercel Analytics to answer:

- Is anyone visiting the app?
- Which pages are getting traffic?
- Did usage change after a deploy?

If analytics look empty after a production deploy, confirm the app includes `@vercel/analytics` and that the latest production deploy completed.

### Structured Logs

GitHub API failures are logged with structured event names:

- `github_commit_search_rate_limited`
- `github_commit_search_failed`

Useful fields include:

- `status`
- `message`
- `rateLimitRemaining`
- `rateLimitReset`

Search usernames and tokens should not appear in logs.

## Troubleshooting

### Deployed Smoke Fails With `401`

Check the target URL. Vercel-generated deployment URLs can be protected. Confirm the workflow is using:

```env
PRODUCTION_BASE_URL=https://my-first-commit-eta.vercel.app
```

### Deployed Smoke Cannot Find App Text

Open the smoke target URL and confirm it renders the public app. If it shows a login, protection page, or unrelated Vercel page, fix the target URL.

### GitHub Searches Are Rate Limited

Check logs for `github_commit_search_rate_limited`.

Confirm `GITHUB_TOKEN` is set in Vercel production. Unauthenticated GitHub Search API requests have a much lower rate limit.

### GitHub Searches Fail With Validation Errors

Check logs for `github_commit_search_failed` with `status: 422`. This usually means the username/query is invalid or GitHub could not validate the search request.

### Production Works But Preview Fails

Preview deployments may not have all production environment variables. Check Vercel project environment variable scope and branch/preview settings.

## Dependency Updates

Dependabot opens minor and patch dependency PRs. Major version upgrades are intentionally ignored by Dependabot and should be handled as planned compatibility work.

Before merging dependency PRs:

1. Confirm checks are green.
2. Review the `package-lock.json` diff for unrelated churn.
3. Merge one dependency PR at a time when possible.
4. Verify main CI after each merge.
