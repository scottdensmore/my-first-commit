# Release Guide

Use this checklist when cutting a new My First Commit release.

## Before Release

1. Confirm `main` is current and clean.
2. Move relevant `CHANGELOG.md` entries from `Unreleased` into a dated version section.
3. Confirm any user-facing docs, screenshots, or runbook notes are current.
4. Run the local validation suite:

   ```bash
   npm audit
   npm test
   npm run lint
   npm run build
   npm run test:e2e
   ```

## Publish Release

1. Create a tag from the current `main` commit:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

2. Create a GitHub release from the tag.
3. Use the matching `CHANGELOG.md` section as the release notes.
4. Mark prereleases only when the release is not intended for normal production use.

## After Release

1. Confirm the Vercel production deployment for `main` succeeded.
2. Confirm the `Production Health Check` workflow passed.
3. Open the live app and run a quick manual search.
4. Verify the README badges still point to healthy workflows.
5. Leave `CHANGELOG.md` with an empty `Unreleased` section ready for the next change.
