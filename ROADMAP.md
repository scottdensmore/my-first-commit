# Roadmap

This roadmap is intentionally lightweight. It captures useful next ideas without turning a small personal app into a process machine.

## Now

- Keep dependency PRs current and merge safe patch/minor updates after CI passes.
- Keep the changelog updated when behavior, docs, operations, dependencies, or security posture changes.
- Use the manual QA checklist for larger UI, metadata, and release-verification changes.

## Later

- Observe `csp_violation` events from preview and production traffic, then tighten the policy against
  what actually fires.
- Replace `'unsafe-inline'` and `'unsafe-eval'` in `script-src` with per-request nonces before
  enforcing the policy, once Next.js runtime behavior and Vercel Analytics are confirmed.
- Add label sync automation if manual label management becomes annoying.

## Maybe

- Add a small public examples section with interesting first-commit searches.
- Add optional share-card copy for discovered commits.
- Add a small visual refresh if the app grows beyond a personal utility.
