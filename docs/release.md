# Release Guide

Use this checklist when cutting a new My First Commit release.

## Before Release

1. Confirm `main` is current and clean.
2. Move relevant `CHANGELOG.md` entries from `Unreleased` into a dated version section.
3. Confirm any user-facing docs, screenshots, or runbook notes are current.
4. Run `npm run validate`, the local [validation suite](development.md#validation).

## Publish Release

Production releases are created automatically after a merge to `main`, a successful `CI / validate` run, a successful Vercel production deployment, and a passing `Production Health Check`. The `Promote Production Release` workflow creates both the Git tag and the GitHub release. The automatic tag format is:

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

## Which Workflow Owns Which Tag

The two release workflows own different tag shapes and must not both publish the same tag:

| Tag | Owner | Notes come from | Marked "Latest" |
| --- | --- | --- | --- |
| `vX.Y.Z` | `Release` | the matching `CHANGELOG.md` section | yes |
| `vX.Y.Z-<deployed-short-sha>` | `Promote Production Release` | deployment metadata | no |

Only version releases are marked "Latest". Deployment tags are deployment records, so
`https://github.com/scottdensmore/my-first-commit/releases/latest` keeps resolving to the current
version rather than to whichever commit deployed most recently.

Both workflows pass `--latest` explicitly. GitHub otherwise picks the pointer automatically from date
and version, and a newly published deployment tag takes "Latest" away from the version release it was
deployed from.

`Release` ignores deployment tags on push. Both workflows used to fire on `vX.Y.Z-<sha>` and race to
call `gh release create`; the loser's notes were discarded, so a deployment release could end up
carrying the `vX.Y.Z` changelog instead of its deployment metadata.

To publish a deployment tag by hand, for example when an automatic promotion was skipped, run
`Release` manually with the tag as input. It produces deployment notes rather than changelog notes.

## After Release

1. Confirm the Vercel production deployment for `main` succeeded.
2. Confirm the `Production Health Check` workflow passed.
3. Open the live app and run a quick manual search.
4. Verify the README badges still point to healthy workflows.
5. Leave `CHANGELOG.md` with an empty `Unreleased` section ready for the next change.
