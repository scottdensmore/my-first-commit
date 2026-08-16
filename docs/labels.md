# Labels

Use labels to make issues and pull requests easy to scan. Keep the set small.

## Suggested Labels

- `bug`: Something is broken or behaving unexpectedly.
- `feature`: A new user-facing capability.
- `maintenance`: Cleanup, refactors, chores, or upkeep that does not change user behavior.
- `dependencies`: Dependency updates, lockfile changes, or package maintenance.
- `security`: Security hardening, vulnerabilities, tokens, headers, or dependency advisories.
- `production`: Deployment, health checks, monitoring, Vercel, or production incidents.
- `docs`: README, runbook, changelog, contributing, architecture, or QA documentation.
- `accessibility`: Keyboard, focus, landmarks, announcements, or screen-reader improvements.
- `testing`: Unit, e2e, CI, production health, or QA coverage.
- `release`: Tags, changelog entries, release notes, or GitHub releases.
- `privacy`: Search data handling, analytics boundaries, or local browser storage.

## Usage Notes

- Prefer one or two labels per issue or PR.
- Use `production` with `bug` for live-site regressions.
- Use `security` with `dependencies` for Dependabot security updates.
- Use `maintenance` for small ownership improvements that are not visible to users.
- Use `docs` for documentation-only changes.

## Syncing

`.github/labels.yml` is the canonical label set. Edit that file and merge it to `main`; the
`Sync Labels` workflow reconciles GitHub with it on any push that touches the file.

Locally:

```bash
npm run check:labels                      # validate the file, no network, no token
npm run sync:labels -- --dry-run          # report what would change
npm run sync:labels                       # create and update
```

The local commands need `GITHUB_TOKEN` and `GITHUB_REPOSITORY`:

```bash
GITHUB_REPOSITORY=scottdensmore/my-first-commit GITHUB_TOKEN="$(gh auth token)" \
  npm run sync:labels -- --dry-run
```

`npm run check:labels` also runs in CI, so an invalid label file fails the pull request rather than
the sync.

### Colors Must Be Quoted

YAML reads an unquoted `5319e7` as scientific notation and `000000` as the integer zero, so a color
silently stops being a string. Every color in `.github/labels.yml` is quoted, and the validator
rejects one that is not with a message naming the problem.

### Names Are Matched Case-Insensitively

GitHub label names are unique without regard to case: a repository cannot hold both `Bug` and
`bug`. A sync matches the file against GitHub the same way, so a label renamed by hand in the
GitHub UI to a different capitalization is one label whose name has drifted, not a missing label
plus a stray one. It is corrected with an update that renames it back, which a dry run shows as
`would update: Bug -> bug`, and `--prune` never deletes it.

For the same reason, two entries in `.github/labels.yml` whose names differ only in case are
rejected by `npm run check:labels` as duplicates. GitHub could not hold both.

### Deleting Labels

Syncing never deletes anything by default. Deleting a label removes it from every issue and pull
request that carries it, and that cannot be undone.

Pruning is available through `--prune`, and from the `Sync Labels` workflow only as a deliberate
manual dispatch with the `prune` input checked. Run it as a dry run first:

```bash
npm run sync:labels -- --dry-run --prune
```

### Dependabot's Labels

Dependabot creates `javascript` and `github_actions` on its own and applies them to its pull
requests. Both are listed in `.github/labels.yml` with the values Dependabot uses, so a sync leaves
them untouched and a prune does not delete labels the repository is actually using.

If Dependabot later introduces another label, add it to the file before pruning.
