# Changelog

All notable changes to My First Commit are documented here.

This project follows a lightweight, human-curated changelog. Keep the newest changes at the top and move items from `Unreleased` into a dated release section when cutting a release.

## Unreleased

### Added

- Baseline security headers for app, API, 404, and generated image responses.
- Runtime `/api/health` endpoint for deployment checks and production troubleshooting.
- Branded app error boundary and custom 404 page.
- Production health check workflow with GitHub issue creation on deployment failures.
- Vercel Analytics, structured server logs, and production runbook guidance.
- README badges, screenshot, project overview, and split development documentation.
- CONTRIBUTING guide with branch, PR, review, and validation workflow.
- MIT license.

### Changed

- Improved homepage layout, footer branding, and visible privacy note.
- Improved GitHub API failure copy for rate limits, timeouts, unavailable GitHub services, validation failures, and unknown errors.
- Added recent-search clearing and browser-only storage guidance.
- Expanded unit and Playwright coverage for homepage behavior, accessibility, generated assets, branded 404, and health checks.

### Security

- Added Dependabot configuration for dependency update pull requests.
- Documented secure GitHub token handling and production configuration.
