# Manual QA Checklist

Use this checklist for larger UI changes, production verification, or any release that changes search behavior, metadata, health checks, or generated assets.

## Core Search

1. Open the app.
2. Confirm the search input receives focus.
3. Search for a known public GitHub username.
4. Confirm the first public commit result appears.
5. Confirm the URL includes `?user=<username>`.
6. Click `Search another user`.
7. Confirm the search field is focused again.

## Validation And Empty States

1. Enter an invalid username such as `octo_cat`.
2. Confirm the inline validation message appears.
3. Confirm the search button is disabled.
4. Search for a username with no indexed public commits.
5. Confirm the empty state explains that GitHub indexing can lag.
6. Confirm `Edit username` returns focus to the search input.

## Recent Searches And Privacy

1. Complete a successful search.
2. Return to the search form.
3. Confirm the recent-search shortcut appears.
4. Click the shortcut and confirm the search runs again.
5. Click `Clear` and confirm recent searches disappear.
6. Confirm the footer says recent searches stay in this browser only.

## Error Recovery

When testing mocked or local failure states, confirm:

1. Rate-limit, timeout, unavailable, and unknown errors show a `Try again` action.
2. Validation errors do not show a retry action.
3. Error states use recovery-focused language.
4. Keyboard users can reach retry and edit actions.

## Accessibility

1. Confirm the page exposes header, main, search, and footer landmarks.
2. Tab from the search field to the search button.
3. With recent searches visible, tab to `Clear` and the recent-search shortcut.
4. Confirm validation messages are announced as status updates.
5. Confirm empty states use `status` and error states use `alert`.

## Production Health

1. Confirm `CI / validate` passed on `main`.
2. Confirm Vercel production deployment completed.
3. Confirm `Production Health Check` passed.
4. Open the production app.
5. Check the runtime endpoint:

   ```bash
   curl https://my-first-commit-eta.vercel.app/api/health
   ```

## Open Graph Preview

Validate social preview assets after changing metadata, branding, generated image routes, or homepage positioning.

1. Open these URLs directly:

   ```text
   https://my-first-commit-eta.vercel.app/opengraph-image
   https://my-first-commit-eta.vercel.app/twitter-image
   ```

2. Confirm each response renders a PNG image.
3. Confirm the image says `My First Commit` and `Discover your origin.`
4. Confirm the image is not cropped, blank, or visually stale.
5. Confirm page metadata points at the generated routes:

   ```bash
   curl -s https://my-first-commit-eta.vercel.app | grep -E 'og:image|twitter:image'
   ```

6. Use a social preview debugger when needed:

   - LinkedIn Post Inspector
   - Facebook Sharing Debugger
   - X Card Validator, if available for your account
