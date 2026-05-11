# Production Runbook

This runbook covers the production checks and levers for My First Commit.

## Production URLs

- Public app: https://my-first-commit-eta.vercel.app
- GitHub repository: https://github.com/scottdensmore/my-first-commit

Use the public app URL for production health checks. Vercel's generated deployment URLs can be protected and may return `401`.

The app also exposes a lightweight runtime health endpoint:

```text
https://my-first-commit-eta.vercel.app/api/health
```

It returns JSON status, deployment metadata, Node runtime version, and whether the public site URL is configured. It does not expose server-side secrets.

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
5. The `Production Health Check` workflow runs Playwright against `PRODUCTION_BASE_URL`.

The production deploy is healthy when both `CI / validate` and `Production Health Check` pass on `main`.

## Release Checklist

Use this checklist before treating a `main` merge as a healthy release:

1. Confirm the pull request was reviewed and all comments were resolved.
2. Confirm the PR passed CI, Vercel preview, and any relevant local checks.
3. Confirm `CHANGELOG.md` includes user-facing changes when the release changes behavior, docs, operations, dependencies, or security posture.
4. Merge the PR into `main`.
5. Confirm Vercel production deployment completed.
6. Confirm `CI / validate` passed on `main`.
7. Confirm `Production Health Check` passed on `main`.
8. Open the public app and verify the homepage loads.
9. Check the runtime health endpoint:

   ```bash
   curl https://my-first-commit-eta.vercel.app/api/health
   ```

10. If the release changed social images or metadata, validate the generated `/opengraph-image` and `/twitter-image` endpoints.

## Production Health Check Alerts

When `Production Health Check` fails, GitHub Actions opens or updates a GitHub issue titled:

```text
Production health check failed
```

Use that issue as the incident record. It includes the health check target, workflow run, and commit SHA.

When responding to a health check failure:

1. Open the workflow run linked from the issue.
2. Confirm the health check target is the public production URL.
3. Open production manually and check whether the app renders.
4. Fix the deployment, configuration, or app regression.
5. Re-run `Production Health Check` or deploy a fix.
6. Close the issue after the production health check passes again.

## Manual Validation

Run the core checks locally:

```bash
npm audit
npm test
npm run lint
npm run build
npm run test:e2e
```

Run a health check against production:

```bash
npm run test:e2e:deployed
```

The deployed browser health check covers the home page, branded 404 page, generated social assets, and `/api/health`.

Check the runtime health endpoint directly:

```bash
curl https://my-first-commit-eta.vercel.app/api/health
```

Run a health check against any deployed URL:

```bash
PLAYWRIGHT_BASE_URL=https://your-deployment.example npm run test:e2e
```

You can also start `Production Health Check` manually from GitHub Actions. Provide the public app URL as `base_url`.

Use the [manual QA checklist](manual-qa.md) for larger UI changes and Open Graph preview validation.

## Observability

This app intentionally uses Vercel-only observability. Do not add Sentry, GlitchTip, or another paid error-monitoring service unless the app grows beyond personal use.

Use these signals together:

- Vercel Analytics for traffic and page-level usage.
- Vercel Logs for runtime errors and server-side GitHub API failures.
- GitHub Actions for CI and production health check status.
- GitHub issues for production health check incidents.

### Vercel Analytics

Use Vercel Analytics to answer:

- Is anyone visiting the app?
- Which pages are getting traffic?
- Did usage change after a deploy?

If analytics look empty after a production deploy, confirm the app includes `@vercel/analytics` and that the latest production deploy completed.

### Vercel Logs

Use Vercel Logs when the app is slow, returns an error, or search behavior looks wrong.

In Vercel:

1. Open the `my-first-commit` project.
2. Go to `Logs`.
3. Filter to the production deployment.
4. Search for `github_commit_search_rate_limited` or `github_commit_search_failed`.
5. Check whether failures line up with a recent deploy, missing environment variable, GitHub rate limit, or invalid search input.

### Structured Logs

GitHub API failures are logged with structured event names:

- `github_commit_search_rate_limited`
- `github_commit_search_timeout`
- `github_commit_search_unavailable`
- `github_commit_search_failed`
- `github_commit_search_malformed_item`

Useful fields include:

- `status`
- `message`
- `rateLimitRemaining`
- `rateLimitReset`
- `itemIndex`

Search usernames and tokens should not appear in logs.

## Security Headers

The app sets baseline security headers from `next.config.ts`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` disabling camera, microphone, geolocation, and payment APIs
- `X-Frame-Options: DENY`

Content Security Policy is intentionally not enabled yet. Next.js and Vercel Analytics need a carefully tuned policy so production scripts, generated images, and analytics continue to work without weakening the policy into noise.

## Accessibility Checks

The browser health checks include accessibility-oriented coverage for landmarks, search form labels, keyboard tab order, validation announcements, and reachable search/recent-search actions.

When changing UI structure, confirm:

1. The header, main content, search form, and footer keep clear accessible names.
2. The search field receives focus on initial load and after reset/edit actions.
3. Keyboard users can tab from the search field to primary actions and recent-search controls.
4. Validation and result states use the appropriate `status` or `alert` role.

## Privacy And Local Storage

The app does not persist searches on a server. Successful searches are stored in the user's browser `localStorage` under:

```text
my-first-commit:recent-searches
```

This powers the recent-search shortcuts. Clearing browser site data removes the list.

## Troubleshooting

### Production Health Check Fails With `401`

Check the target URL. Vercel-generated deployment URLs can be protected. Confirm the workflow is using:

```env
PRODUCTION_BASE_URL=https://my-first-commit-eta.vercel.app
```

### Production Health Check Cannot Find App Text

Open the health check target URL and confirm it renders the public app. If it shows a login, protection page, or unrelated Vercel page, fix the target URL.

### GitHub Searches Are Rate Limited

Check logs for `github_commit_search_rate_limited`.

Confirm `GITHUB_TOKEN` is set in Vercel production. Unauthenticated GitHub Search API requests have a much lower rate limit.

### GitHub Searches Fail With Validation Errors

Check logs for `github_commit_search_failed` with `status: 422`. This usually means the username/query is invalid or GitHub could not validate the search request.

### GitHub Searches Time Out

Check logs for `github_commit_search_timeout`. This means GitHub did not respond before the server action timeout. Retry the search and check GitHub status if it persists.

### GitHub Is Temporarily Unavailable

Check logs for `github_commit_search_unavailable` with a `5xx` status. The app should show a retry-friendly message. Wait for GitHub to recover or retry later.

### GitHub Returns Unexpected Commit Data

Check logs for `github_commit_search_malformed_item`. The app skips malformed records and shows an empty state if no valid commits remain.

### Production Works But Preview Fails

Preview deployments may not have all production environment variables. Check Vercel project environment variable scope and branch/preview settings.

## Dependency Updates

Dependabot opens minor and patch dependency PRs. Major version upgrades are intentionally ignored by Dependabot and should be handled as planned compatibility work.

Before merging dependency PRs:

1. Confirm checks are green.
2. Review the `package-lock.json` diff for unrelated churn.
3. Merge one dependency PR at a time when possible.
4. Verify main CI after each merge.
