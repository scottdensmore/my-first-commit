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

## Future Automation

The canonical label set is captured in `.github/labels.yml`.

To sync labels manually with GitHub CLI:

```bash
gh label create bug --color d73a4a --description "Something is broken or behaving unexpectedly."
gh label create feature --color 0e8a16 --description "A new user-facing capability."
gh label create maintenance --color cfd3d7 --description "Cleanup, refactors, chores, or upkeep that does not change user behavior."
gh label create dependencies --color 0366d6 --description "Dependency updates, lockfile changes, or package maintenance."
gh label create security --color b60205 --description "Security hardening, vulnerabilities, tokens, headers, or dependency advisories."
gh label create production --color fbca04 --description "Deployment, health checks, monitoring, Vercel, or production incidents."
gh label create docs --color 0075ca --description "README, runbook, changelog, contributing, architecture, or QA documentation."
gh label create accessibility --color 5319e7 --description "Keyboard, focus, landmarks, announcements, or screen-reader improvements."
gh label create testing --color 1d76db --description "Unit, e2e, CI, production health, or QA coverage."
```

Use `gh label edit <name>` instead of `create` when a label already exists. Add automated label syncing later only if manual sync becomes annoying.
