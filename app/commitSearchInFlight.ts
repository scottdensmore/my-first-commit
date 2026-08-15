import { copyCommitSearchResult } from "./commitSearchCache";
import type { CommitData } from "./commitTypes";

// The cache only helps once a search has finished. Until then every concurrent request for the
// same username is a separate call to GitHub against one shared token quota -- so a link shared
// with a crowd multiplies into as many upstream searches as there are readers, all asking the
// identical question. Callers that arrive while a search is running now wait for its answer.
//
// Per process, like the cache: a serverless instance coalesces only the requests it serves, and
// the map is empty again on a cold start. It bounds a burst against one instance, not globally.
//
// A joiner inherits the search already in progress, including how much of its 10s timeout budget
// has elapsed -- so joining at 9.5s can surface a timeout almost immediately. That is accepted:
// the key is released either way, so the retry the visitor is offered starts a fresh search with
// a full budget.
const inFlightSearches = new Map<string, Promise<CommitData>>();

/**
 * Runs `startSearch` for `cacheKey`, or joins the run already in progress for it.
 *
 * The key is released as the search settles, including when it fails: a key left behind would
 * make every later search for that username replay the same failure instead of retrying.
 */
export function coalesceCommitSearch(
  cacheKey: string,
  startSearch: () => Promise<CommitData>,
): Promise<CommitData> {
  const inFlight = inFlightSearches.get(cacheKey);
  // Copies rather than the shared object, so one caller cannot mutate what the others receive.
  if (inFlight) return inFlight.then(copyCommitSearchResult);

  // Deferred to a microtask so a synchronous throw from startSearch becomes a rejection of the
  // returned promise rather than escaping the call, which would hand the caller an exception
  // where the signature promises a rejection. The key is not stranded either way -- the throw
  // escapes before `set` runs -- and production passes an arrow that does nothing but call an
  // async function, so it cannot throw synchronously. This keeps the helper honest for any
  // other caller.
  //
  // Invoked inside the arrow rather than passed as `.then(startSearch)`, which would call it
  // unbound and hand it the resolution value as an argument.
  const search = Promise.resolve()
    .then(() => startSearch())
    .finally(() => inFlightSearches.delete(cacheKey));

  inFlightSearches.set(cacheKey, search);

  return search.then(copyCommitSearchResult);
}

export function clearInFlightCommitSearches() {
  inFlightSearches.clear();
}

/** Test seam: proves a settled or failed search leaves nothing behind. */
export function inFlightCommitSearchCount() {
  return inFlightSearches.size;
}
