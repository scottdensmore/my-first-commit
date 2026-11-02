# Private minimatch compatibility adapter

This package exposes the legacy callable CommonJS API and modern named/ESM API while delegating
all matching to the unmodified, exactly pinned npm package minimatch 11.0.1. The direct dependency
is installed under the alias upstream-minimatch so the project's minimatch override cannot recur.
Its actual package name/version remain minimatch/11.0.1 in the dependency and npm audit graph.

No matching algorithm is copied from minimatch 3 or 10. The adapter restores makeRe through the
upstream Minimatch constructor and wraps defaults without mutating the upstream singleton. It
preserves the upstream security bounds. It is a project-owned compatibility layer, not an upstream
release, and is private to prevent accidental registry publication.

The retained braces security patch is a separate package and is unchanged. Installation uses this
adapter's immutable committed archive URL with lockfile integrity. Validate callable/named/ESM
imports, default factories, real ESLint plugin consumers and the advisory amplification limits
before merging. Exact matching behavior outside those contracts is not assumed to be identical
between major versions.
