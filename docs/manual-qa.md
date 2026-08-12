# Manual QA Checklist

**In the local mocked run**, existing unit and Playwright coverage already asserts search,
validation, empty and error states, landmarks, tab order, focus behavior, security headers, the
branded 404 page, and `/api/health` in `tests/e2e/home.spec.ts`, plus rerunning and clearing recent
searches in `app/page.test.tsx`. Do not re-test those by hand locally; if one of them can regress
unnoticed, add coverage instead of a checklist item.

**Against a deployed target the commit-search states are not covered.** They live in one
`test.describe` block that calls `test.skip(isDeployedTarget, …)`, so the `Production Health Check`
workflow never exercises a result, empty, or error state in production, though it does still cover
landmarks, tab order, focus, security headers, the 404 page, and `/api/health` there. The CSP report
POST is also skipped against a deployed target, deliberately, so production logs stay clean. Use this
checklist for the commit-search states and for the judgments automation cannot make.

## Open Graph Preview

Validate after changing metadata, branding, generated image routes, or homepage positioning.

1. Open these URLs directly:

   ```text
   https://my-first-commit-eta.vercel.app/opengraph-image
   https://my-first-commit-eta.vercel.app/twitter-image
   ```

2. Confirm each image says `My First Commit` and `Discover your origin.`
3. Confirm the image is not cropped, blank, or visually stale. Playwright checks that the routes
   return a PNG; only a person can tell whether it still looks right.
4. Check the rendered card in a social preview debugger — LinkedIn Post Inspector, Facebook Sharing
   Debugger, or the X Card Validator — since each service caches and crops differently.

## Visual And Responsive Spot Check

For larger UI changes, on real devices rather than an emulated viewport:

1. Confirm the layout holds from a narrow phone through a wide desktop window.
2. Confirm long usernames, long commit messages, and browser zoom to 200% do not break the timeline.
3. The app is light-only, with no `dark:` variants and a single `:root` palette. Confirm it stays
   legible when the operating system is in dark mode and under forced-colors mode.

## Production Spot Check

The deployed browser health check skips every commit-search state, so these are unverified in
production until a person looks. After a release:

1. Run one real search against a live GitHub account. This is the only check that exercises the real
   GitHub Search API with the production `GITHUB_TOKEN`.
2. Search a username with no indexed public commits and confirm the empty state explains that GitHub
   indexing can lag.
3. Rate-limit and outage states cannot be triggered on demand in production; they depend on GitHub.
   Local coverage already asserts their retry actions and recovery copy through the `e2e-rate-limit`
   and `e2e-unavailable` fixtures, so do not retest them by hand. Confirm real behavior from Vercel
   logs after the next live failure.
4. Confirm the result timeline renders a real commit with its message, date, and repository link.
