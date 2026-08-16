// The cache answers a repeated username and the in-flight map shares one search between
// concurrent readers of the same one. Neither touches a flood of *distinct* usernames: every
// one of those is a genuine miss that reaches GitHub, against a search quota of 30 requests
// per minute for the shared token. This bounds what one client can spend of it.
//
// Per client rather than globally, deliberately. A global counter would meet ordinary visitors
// with the rate-limit screen exactly when the app is busiest, and its threshold could only be
// guessed at without traffic data. A per-client window targets the one caller behaving unlike
// a person, so the threshold can sit far above human pace and stop being a guess.
//
// Per process, like the cache and the in-flight map: a serverless instance limits only the
// requests it serves and starts empty on every cold start, so an in-process limit of N is
// really N x instances. This reduces what abuse costs; it is not a quota guarantee, and
// nothing here should be read as a global ceiling. See docs/production.md.
//
// The limiter never learns who a client is. It is handed an opaque key -- a salted hash, from
// app/searchClientKey.ts -- and never sees the searched username at all, so neither can reach
// a log line or an eviction decision from here.

/**
 * 30 searches per minute, per client. A person types a distinct valid GitHub handle every few
 * seconds at most, so a sustained one every two seconds for a full minute is not a person; a
 * visitor clicking every recent-search shortcut they have does not come close. It is also the
 * documented ceiling for authenticated GitHub search, so a client past it is on its own able
 * to spend the whole shared per-minute allowance.
 */
export const COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES = 30;
export const COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * A map keyed by client is a memory-exhaustion vector if it is allowed to grow with the number
 * of distinct keys that arrive, which is the one thing a flood produces cheaply. Idle clients
 * are dropped as the window passes them and this caps what is left, so the map costs a bounded
 * amount however many keys it is shown -- a few hundred kilobytes at most.
 */
export const COMMIT_SEARCH_RATE_LIMIT_MAX_CLIENTS = 500;

/**
 * Search times inside the current window, per client, oldest first. A rolling window rather
 * than a counter that resets on a fixed boundary, which would let a client spend two full
 * allowances back to back across one.
 *
 * Each list is capped by the limit itself: a refused search is not recorded, so a client that
 * keeps trying does not grow its own entry.
 */
const recentSearchTimes = new Map<string, number[]>();

function dropIdleClients(now: number) {
  const windowStart = now - COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS;

  for (const [clientKey, searchTimes] of recentSearchTimes) {
    const lastSearchedAt = searchTimes[searchTimes.length - 1];
    if (lastSearchedAt === undefined || lastSearchedAt <= windowStart) {
      recentSearchTimes.delete(clientKey);
    }
  }
}

function evictLeastRecentlyActiveClients() {
  while (recentSearchTimes.size > COMMIT_SEARCH_RATE_LIMIT_MAX_CLIENTS) {
    const oldestClientKey = recentSearchTimes.keys().next().value;
    if (oldestClientKey === undefined) return;
    recentSearchTimes.delete(oldestClientKey);
  }
}

/**
 * Records a search for `clientKey` and reports whether it is within the window's allowance.
 *
 * Eviction only ever forgets a client, which refills its allowance. That is the direction this
 * has to fail in: a caller who can influence which key it is counted under must not be able to
 * push another client into being refused.
 */
export function allowCommitSearch(clientKey: string, now = Date.now()): boolean {
  const windowStart = now - COMMIT_SEARCH_RATE_LIMIT_WINDOW_MS;
  const searchTimes = (recentSearchTimes.get(clientKey) ?? []).filter(
    (searchedAt) => searchedAt > windowStart,
  );

  const allowed = searchTimes.length < COMMIT_SEARCH_RATE_LIMIT_MAX_SEARCHES;
  if (allowed) searchTimes.push(now);

  // Re-inserted so iteration order stays least-recently-active first, which is what eviction
  // reads. A refused client is re-inserted too: being evicted is a reprieve, so the client
  // being refused right now is the last one that should get it.
  recentSearchTimes.delete(clientKey);
  recentSearchTimes.set(clientKey, searchTimes);

  dropIdleClients(now);
  evictLeastRecentlyActiveClients();

  return allowed;
}

export function clearCommitSearchRateLimit() {
  recentSearchTimes.clear();
}

/** Test seam: proves the map stays bounded under a flood of distinct keys. */
export function trackedCommitSearchClientCount() {
  return recentSearchTimes.size;
}

/**
 * Test seam: proves what is retained is an opaque key and nothing else -- no username, and no
 * raw client identifier.
 */
export function trackedCommitSearchClientKeys() {
  return [...recentSearchTimes.keys()];
}
