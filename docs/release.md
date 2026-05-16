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

Production releases are created automatically after a merge to `main`, a successful Vercel production deployment, and a passing `Production Health Check`. The `Promote Production Release` workflow creates both the Git tag and the GitHub release. The automatic tag format is:

```text
vX.Y.Z-<deployed-short-sha>
```

The deployed footer shows the same release tag and links to the matching GitHub release.

1. Create a tag from the current `main` commit:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

2. Confirm the `Release` workflow publishes the GitHub release automatically.
3. If needed, run the workflow manually with the existing `vX.Y.Z` tag.
4. Use the matching `CHANGELOG.md` section as the release notes.
5. Mark prereleases only when the release is not intended for normal production use.

The release workflow requires a `CHANGELOG.md` section named for the tag without the `v` prefix, for example:

```markdown
## 0.2.0
```

Automatic deployment release tags can use generated release notes when a matching changelog section does not exist.

## After Release

1. Confirm the Vercel production deployment for `main` succeeded.
2. Confirm the `Production Health Check` workflow passed.
3. Open the live app and run a quick manual search.
4. Verify the README badges still point to healthy workflows.
5. Leave `CHANGELOG.md` with an empty `Unreleased` section ready for the next change.
