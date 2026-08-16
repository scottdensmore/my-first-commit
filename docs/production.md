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

It returns JSON status, deployment metadata, and whether the public site URL and `GITHUB_TOKEN` are configured. It does not expose server-side secrets or detailed runtime versions.

`checks.githubToken` reports presence only, never the value, a prefix, a length, or a hash. The endpoint is public and uncached, so nothing beyond a boolean belongs there. It confirms the variable is set; it does not prove the token is valid or unexpired.

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

### Rotating `GITHUB_TOKEN`

Vercel applies environment variable changes to new builds only, so a rotation does nothing until the
project is redeployed.

1. Add the new token in Vercel before revoking the old one, so production never falls back to
   unauthenticated requests at 60 requests per hour.
2. Redeploy production.
3. Confirm the variable reached the running deployment:

   ```bash
   curl -s https://my-first-commit-eta.vercel.app/api/health | grep -o '"githubToken":{"configured":[a-z]*}'
   ```

4. Run a search on the public app. `configured: true` only proves the variable is set; a search is
   what proves the token is accepted by GitHub.
5. Revoke the old token.

The app only reads public commit search data, so the token needs no scopes. An unscoped classic token
still raises the Search API limit from 60 to 5,000 requests per hour.

## Deployment Flow

1. Merge a green PR into `main`.
2. GitHub Actions runs `CI / validate`.
3. Vercel builds and deploys production.
4. GitHub receives a production `deployment_status` event.
5. The `Production Health Check` workflow runs Playwright against `PRODUCTION_BASE_URL`.
6. The `Promote Production Release` workflow creates the deployment tag and GitHub release only after the matching `main` CI run and production health check pass.

The production deploy is healthy when `CI / validate`, `Production Health Check`, and `Promote Production Release` pass on `main`.

### Skipped Promotions Are Normal

When two merges land close together, both queue a promotion. The older one runs after `main` has
already advanced, so its commit is no longer the deployed production commit. That run logs:

```text
main has advanced to <sha>.
<older-sha> is no longer the deployed production commit; skipping its release.
```

This is expected. The superseded commit intentionally gets no tag and no release, because the newer
commit is promoted in its place. Gaps in the deployment tag sequence are normal for the same reason.

Before this guard existed, the older promotion instead failed while pushing its tag, because
`GITHUB_TOKEN` cannot push a ref whose workflow files no longer match `main`:

```text
refusing to allow a GitHub App to create or update workflow `.github/workflows/ci.yml`
without `workflows` permission
```

A promotion that fails for any other reason is a real failure and should be investigated.

### Promotion Waits For CI

Vercel deploys in parallel with `CI / validate`, so a deployment and its health check can finish
before CI concludes on `main`. The promotion waits up to 15 minutes for the deployed commit's CI run
to reach a conclusion, logging one line per poll:

```text
CI run for <sha> is in_progress; waiting for it to finish.
```

Waiting is normal. A promotion fails only when CI concludes with something other than success, or
when no CI run reaches a conclusion inside the timeout.

## Release Checklist

See the [release guide](release.md). It owns the before-and-after-release checklist, moving
`CHANGELOG.md` entries into a dated section, and which workflow publishes which tag. Writing the
entry in the first place is a per-change step in [CONTRIBUTING.md](../CONTRIBUTING.md).

## The Release Invariant

**A release tag names a commit that was proven healthy in production, not a commit that merely
merged and then something healthy was observed.** Two checks hold that up, and both exist because
the obvious version of each answers a subtly different question.

**The health run proves which commit it tested.** It points Playwright at a mutable alias, so a
green suite on its own means something healthy was serving that URL — not that the commit which
triggered the run was serving it. Before any spec runs,
`scripts/verify-deployed-commit.mjs` asks `/api/health` what commit is live and compares it to the
deployment's SHA. A deployment still in flight, or a failed one leaving the previous build live,
now fails here in seconds rather than producing a wall of results describing code that is not
deployed. The payload carries an abbreviated seven-character SHA, so the comparison is by prefix; a
run reporting `local` is refused, because that is what the route returns when
`VERCEL_GIT_COMMIT_SHA` is unset and it identifies no deployment at all.

Manual runs pass no expected SHA, since a URL given by hand has no commit to expect, and the step
is skipped.

**Promotion asks which commit is live, not which is newest.** The superseded guard resolves the
active deployment through the deployments API — the most recent one whose latest status is
`success` — rather than comparing against the tip of `main`. Those are different questions: `main`
advances at merge, while a deployment becomes live later and may never. Comparing against the tip
meant a newer commit still deploying, or one that failed, suppressed the release of the commit
genuinely in production, and that release was never cut at all. When no successful deployment can
be found, the guard stops rather than guessing.

Superseded deployments are still skipped, for the reason they always were: two deployments landing
close together queue two promotions, and the older one cannot push its tag once its workflow files
no longer match `main`.

To check the invariant by hand:

```bash
curl -s https://my-first-commit-eta.vercel.app/api/health | jq -r .commit
GITHUB_TOKEN=$(gh auth token) node scripts/resolve-active-deployment.mjs \
  scottdensmore/my-first-commit Production
```

The first prints an abbreviated SHA and the second a full one. They must agree; if they do not,
the alias and the deployment record disagree about what is live, and no release should be cut until
they do.

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

Run `npm run validate`, the local [validation suite](development.md#validation), first.

Run a health check against production:

```bash
npm run test:e2e:deployed
```

The Production Health Check browser workflow covers the home page, branded 404 page, generated social assets, and `/api/health`.

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
- `github_commit_search_incomplete`
- `commit_search_rate_limited_client`

`commit_search_rate_limited_client` is this app refusing a search, not GitHub refusing one. See
[Bounding Search Bursts](#bounding-search-bursts). It carries the `limit` and `windowMs` in force
and nothing that identifies the client or the search, so the event counts refusals and cannot be
used to trace one. A steady trickle is ordinary internet background noise; a sustained rise means
one or more clients are searching far faster than a person can, on at least one instance.

`github_commit_search_incomplete` is not a failure. GitHub returned `incomplete_results`, meaning it
abandoned the search before scanning every commit and returned whatever it had indexed. The app
labels that result partial and deliberately does not cache it, so a rise in this event means
visitors are seeing partial results rather than that searches are erroring. An `itemCount` of `0`
means the search returned nothing and the visitor saw the unfinished-search state instead.

Useful fields include:

- `status`
- `errorKind`
- `rateLimitRemaining`
- `rateLimitReset`
- `itemIndex`
- `itemCount`

Upstream error messages are used only to classify failures and are not logged. Rate-limit metadata
is logged only when header values are valid non-negative integers. Search usernames, request URLs,
tokens, and raw upstream error details should not appear in logs.

## Bounding Search Bursts

GitHub's Search API allows **30 requests per minute** for an authenticated token, and 10 per minute
unauthenticated. That is the real ceiling every visitor shares, and one script asking for thousands
of distinct usernames can spend it in seconds: each one is a cache miss and a coalescer miss, so
each one reaches GitHub.

The app bounds this per client, in `app/_lib/commitSearchRateLimit.ts`: **30 searches per rolling
60 seconds**, counted only for searches that would reach GitHub, with anything past that answered
by the existing rate-limit screen.

### Read This As A Cost, Not A Quota

The window is a `Map` in one server instance, exactly like the commit cache and the in-flight map.
So:

- The limit is 30 per client **per instance**. Vercel scales instances with load, so the app-wide
  effect is 30 x however many instances are running.
- A cold start resets it. A burst spread across cold starts is barely limited at all.
- It therefore **cannot** defend the shared 30/minute GitHub ceiling and must not be described as
  if it does. What actually removes upstream calls is the cache and the request coalescing: a
  repeated username costs nothing, and concurrent readers of one shared link cost one search.

What it does buy is that abuse stops being free. A single client cannot walk a username list at
machine speed through one instance, and the traffic that gets through is shaped like traffic from
many separate clients rather than one.

A real global ceiling is platform configuration, not code — a Vercel Firewall rate-limit rule on
the app, keyed by IP, the same lever the [CSP report section](#rate-limiting-csp-reports)
describes. Nothing in this repository configures or reads it. If one is added, note it here.

### Why 30 A Minute

A person types a distinct valid GitHub handle every few seconds at the very fastest, and a visitor
clicking every recent-search shortcut they have stored produces five requests and then stops to
read. Thirty a minute, sustained, is one every two seconds for a full minute; no visitor reaches
it, so the threshold does not need traffic data to justify and lowering it would only start
catching people. It is also the documented authenticated search ceiling, so a client past it is by
itself capable of spending the whole shared per-minute allowance.

A visitor who somehow does reach it sees the ordinary "GitHub is asking us to slow down" screen
with its retry, and is under the limit again within a minute.

### What Is Held In Memory, And For How Long

Per client, until the client has been quiet for longer than the window:

- A salted SHA-256 hash of the forwarded client address.
- The timestamps of that client's searches inside the current 60-second window, at most 30 of them.

Nothing else. The searched username never reaches the limiter — it is handed an opaque key — so no
username is stored, logged, or associated with a client anywhere in this path. The salt is 32
random bytes generated per process and never persisted.

A memory dump of a running instance would show the salt, those hashes, and those timestamps. With
the salt in hand, an investigator could confirm whether an address they already suspected was
among the clients active in the last minute; they could not read the addresses out, correlate them
with another instance or with the same instance before a restart, or learn anything at all about
what was searched.

### The Forwarded Header Is Untrusted Input

The client key comes from `x-vercel-forwarded-for`, falling back to `x-forwarded-for`. Vercel sets
both itself and overwrites `x-forwarded-for` from the connecting socket precisely so it cannot be
spoofed, so on this deployment neither is attacker-controlled. `x-vercel-forwarded-for` is
preferred because it is the one a proxy placed in front of Vercel could not overwrite either.

Behind some other proxy that forwards a client's header verbatim, a spoofer could:

- **Split their own traffic** across many fabricated addresses and get a fresh allowance for each.
  This weakens the limit to the cost of forging headers. It cannot exhaust memory: idle clients are
  dropped and the map is capped, and eviction under a flood only ever *forgets* a client, which
  refills an allowance rather than refusing anyone.
- **Spend another client's allowance** by sending that client's address, refusing them for up to
  one window. The blast radius is one minute, one instance, and one address the attacker had to
  know already; nothing is revealed to them, and nothing persists.

They cannot learn who else has searched, what anyone searched for, or read any stored key back.

## Security Headers

The app sets baseline security headers from `next.config.ts`:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` disabling camera, microphone, geolocation, and payment APIs
- `X-Frame-Options: DENY`
- `Content-Security-Policy-Report-Only` for CSP tuning without blocking production traffic

Content Security Policy is currently report-only. Review Vercel logs before moving from report-only to enforcement.

### CSP Violation Reports

The policy names a reporting destination through both `report-uri` and `report-to`, backed by the
`Reporting-Endpoints` header. Browsers post violations to `/api/csp-report`, which logs them as
structured `csp_violation` events. Without this, a report-only policy is unobservable: violations
reach each visitor's browser console and nowhere else.

Find them in Vercel Logs by searching for:

```text
csp_violation
```

Logged fields:

- `documentUri`
- `blockedUri`
- `effectiveDirective`
- `disposition`
- `statusCode`
- `sourceFile`
- `lineNumber`
- `columnNumber`

`http:` and `https:` URLs are reduced to origin and path. Query strings are dropped because the app
puts the searched username in `?user=`, and search usernames must not reach logs. Every other scheme
is reduced to the scheme alone — `data:`, `blob:`, and `javascript:` carry their payload inline, and
`mailto:` or an app-specific scheme registered by an extension carries an address or a path there —
so `data:` and `my-app:` are logged with nothing after the colon. The reported `original-policy` and
`script-sample` are never read at all: the policy is long and already known, and the sample can
contain page content or user input.

The endpoint is unauthenticated, so its intake is bounded three ways:

- **Content type.** Only `application/csp-report` (from `report-uri`) and `application/reports+json`
  (from the Reporting API) are read. Anything else is answered `415` without the body being touched.
- **Body size.** 16 KB, counted in bytes rather than characters, and enforced as the body arrives: an
  oversized `Content-Length` is refused before a byte is read, and because that header can be absent
  or untrue the stream is counted while it is consumed and cancelled the moment the limit is passed.
  Oversized bodies are answered `413`.
- **Reports per request.** At most **10** violations are logged from one POST. A Reporting API array
  is a batch, so without a cap a single request could turn into a log record per entry. The overflow
  is counted in one `csp_report_truncated` event carrying `received` and `logged`.

Other events from the same endpoint indicate a malformed or hostile POST rather than a real
violation: `csp_report_malformed`, `csp_report_empty`, `csp_report_too_large`,
`csp_report_unsupported_type`, `csp_report_truncated`, and `csp_report_unreadable`.

### Rate Limiting CSP Reports

The bounds above cap what one request can cost. They do not cap how many requests arrive, and this
repository has no place to fix that: the app runs as serverless functions with no shared state, so
per-instance counting would not hold across instances. Rate limiting or sampling for
`/api/csp-report` is platform configuration, applied in the Vercel project rather than in code.

If `csp_violation` or `csp_report_*` volume becomes noisy or expensive:

1. Add a Vercel Firewall rate-limit rule scoped to the `/api/csp-report` path, keyed by IP.
2. If real traffic alone is the volume, lower the sampling instead — CSP supports it through the
   Reporting API endpoint configuration, and a report-only policy does not need every duplicate.
3. Re-check the log volume after either change before tightening further.

None of this is in the repository, and nothing in the app reads it. Treat a change here as an
account-level operational change, and note it in this runbook when it is made.

### Moving CSP To Enforcement

Do not simply rename the header. `script-src` currently allows `'unsafe-inline'` and `'unsafe-eval'`,
so enforcing the policy as written would activate `frame-ancestors`, `base-uri`, `form-action`, and
`default-src` without blocking injected inline script, which is the main thing CSP defends against.

The intended order is:

1. Collect `csp_violation` events from real traffic in preview and production.
2. Tighten the policy against what actually fires.
3. Replace `'unsafe-inline'` and `'unsafe-eval'` in `script-src` with per-request nonces, which
   requires middleware and can break the Next.js inline bootstrap and Vercel Analytics.
4. Only then rename the header to `Content-Security-Policy`.

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

Successful and empty GitHub search results may also be cached briefly in server memory by normalized username to reduce repeated GitHub API calls. This cache is ephemeral and is not a database.

Rate limiting holds a salted hash of each recent client's forwarded address, and the times of that client's searches in the last minute, in the same ephemeral server memory. No address and no username is stored, and the two are never held together. See [Bounding Search Bursts](#bounding-search-bursts).

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

Check whether the running deployment sees it:

```bash
curl -s https://my-first-commit-eta.vercel.app/api/health
```

`checks.githubToken.configured: false` means the variable is missing from the deployment, usually
because it was changed without redeploying. `true` with rate limiting means the token is set but
expired, revoked, or genuinely over its limit.

### Visitors Report Rate Limiting But GitHub Is Not Rate Limiting

Check whether the logs show `commit_search_rate_limited_client` rather than
`github_commit_search_rate_limited`. The first is this app's own per-client bound, the second is
GitHub's. The visitor sees the same screen either way, which is deliberate, so the log is what
tells the two apart. See [Bounding Search Bursts](#bounding-search-bursts) for the threshold and
why a person is not expected to reach it.

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

### Vercel Builds A Branch That Has No App Code

Vercel creates a deployment for every branch push. A branch whose tree has no `package.json` fails at
the install step with `ENOENT ... /vercel/path0/package.json`.

This happened with Entire's checkpoint storage. Entire used to push `entire/checkpoints/v1`, a branch
holding only its object store, on every `git push`, and each push produced a failed preview
deployment.

Do not try to fix this with `vercel.json`. Vercel reads `vercel.json` from the commit being deployed,
so `git.deploymentEnabled` and `ignoreCommand` are never consulted for a branch that does not contain
the file. That is exactly the branch class the setting appears to target, which makes the fix look
correct while doing nothing.

Fix it at the source instead, so no branch is pushed:

```bash
entire configure --checkpoint-backend refs
```

Checkpoints then land under `refs/entire/checkpoints/*` rather than `refs/heads/*`, and Vercel has no
branch to deploy. The old `entire/checkpoints/v1` branch can stay; it is simply no longer pushed to.

Verify from the GitHub side without Vercel access:

```bash
git ls-remote origin 'refs/*' | grep entire   # checkpoints should be outside refs/heads/
gh api "repos/<owner>/<repo>/deployments?per_page=10" --jq '.[] | "\(.id) \(.environment) \(.ref)"'
```

## Dependency Updates

Dependabot opens minor and patch dependency PRs. Major version upgrades are intentionally ignored by Dependabot and should be handled as planned compatibility work.

Before merging dependency PRs:

1. Confirm checks are green.
2. Review the `package-lock.json` diff for unrelated churn.
3. Merge one dependency PR at a time when possible.
4. Verify main CI after each merge.
