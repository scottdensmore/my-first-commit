# Product Guide

My First Commit turns GitHub's public commit search into a small origin story. A visitor enters a
GitHub username and sees the earliest public commit GitHub can find, followed by the next nine
results in chronological order.

## Product Principles

- **Focused:** one search task, without accounts, profiles, feeds, or a database.
- **Honest:** partial or unavailable GitHub results are described as such rather than presented as
  authoritative history.
- **Recoverable:** empty results, rate limits, timeouts, and upstream failures offer a useful next
  action.
- **Private by default:** recent searches stay in the browser, and searched usernames are excluded
  from analytics properties and analytics URLs.
- **Shareable:** a search can be sent as a URL or copied as a compact text summary.

## Capabilities

### Origin discovery

The app searches GitHub's public commit index by author, orders results from oldest to newest, and
requests the first ten matches. The first result receives a detailed summary; the following results
form the rest of the timeline.

### Search shortcuts

Known public profiles provide examples for a first visit and recovery from an empty result. After a
successful search, up to five recent usernames are kept in the visitor's browser as shortcuts. They
can be rerun or cleared without creating an account.

### Sharing

A completed search updates the page URL with the username. Opening that URL starts the same search,
and a copy action creates a short result summary with links back to the search and earliest commit.

### Failure handling

Validation errors, empty searches, rate limits, timeouts, GitHub outages, and unexpected failures
have distinct messages and recovery paths. When GitHub marks a search incomplete, the app labels
the timeline as partial, does not cache it, and offers another search without discarding the visible
results if that retry fails.

### Production visibility

The footer identifies the deployed release. GitHub Actions validates each change, a production
browser check exercises healthy deployments, and a release is promoted only after the deployed
commit passes both checks.

## Data and Privacy

- A searched username is sent to GitHub to retrieve public commit data.
- `GITHUB_TOKEN`, when configured, is used only by the server and is never exposed to the browser.
- Recent searches are stored in browser `localStorage` under
  `my-first-commit:recent-searches`.
- Successful and empty search results may be cached briefly in one server process to reduce
  repeated GitHub API calls. The cache is temporary and is not durable storage.
- Vercel Analytics receives product-health events without the searched username. Shared-search
  parameters are removed from analytics URLs before they are sent.
- The app has no accounts, database, or app-owned server-side search history.

The live [privacy page](https://my-first-commit-eta.vercel.app/privacy) is the visitor-facing notice.
The [architecture guide](architecture.md#data-boundaries) describes the implementation boundaries,
and the [production runbook](production.md#privacy-and-local-storage) covers operational details.

## Limitations

“First commit” means the earliest public commit GitHub's current search index returns for an author.
It is not a complete or immutable record of everything that person has authored.

- Only public commits indexed by GitHub are searchable. Private commits, deleted repositories, and
  private forks are not included.
- GitHub's index can lag behind new pushes, omit older history, or return the same commit through
  forks and mirrors.
- Squashed, rebased, rewritten, or force-pushed history can change the earliest visible result.
- Renamed accounts, changed author emails, bot-authored commits, and missing author metadata can
  affect which commits match a username.
- GitHub may return an incomplete result when a search takes too long. The app labels that result as
  partial rather than claiming it found the definitive first commit.
- Unauthenticated requests have stricter rate limits. A server-side token improves reliability but
  does not make private data searchable.

## Technology

My First Commit is a Next.js App Router application built with React, strict TypeScript, Tailwind
CSS, Octokit, and Vercel Analytics. It uses the visitor's system fonts and generated metadata images,
so builds do not depend on a font or image host. See the [architecture guide](architecture.md) for
the request flow and the [development guide](development.md) for the supported runtime and commands.
