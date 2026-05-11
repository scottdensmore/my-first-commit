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
- `testing`: Unit, e2e, CI, smoke, or QA coverage.

## Usage Notes

- Prefer one or two labels per issue or PR.
- Use `production` with `bug` for live-site regressions.
- Use `security` with `dependencies` for Dependabot security updates.
- Use `maintenance` for small ownership improvements that are not visible to users.
- Use `docs` for documentation-only changes.

## Future Automation

If manual label management becomes tedious, add a label sync workflow or `.github/labels.yml` in a separate PR.
