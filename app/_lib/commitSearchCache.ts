import type { CommitData, CommitInfo } from "./commitTypes";

const COMMIT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMIT_SEARCH_CACHE_MAX_ENTRIES = 100;

type CacheEntry = {
  expiresAt: number;
  result: CommitData;
};

const commitSearchCache = new Map<string, CacheEntry>();

/**
 * Exported so the in-flight map shares one definition with the cache. Both hand a stored or
 * shared result to more than one caller, and neither wants a caller's mutation to reach the
 * other holders of it.
 */
export function copyCommitSearchResult(result: CommitData): CommitData {
  // Copied per variant rather than by spreading the union. `commits.map` returns a plain array,
  // which is no longer assignable to either variant's tuple, and the narrowing is what tells the
  // compiler which shape it is rebuilding -- a success keeps at least one commit, a failure stays
  // empty. Spreading the union and patching `commits` would need a cast to compile, and a cast
  // here is exactly the promise this refactor removes.
  const copyCommit = (commit: CommitInfo): CommitInfo => ({
    ...commit,
    repository: { ...commit.repository },
    author: { ...commit.author },
  });

  if (!result.found) return { ...result, commits: [] };

  const [first, ...rest] = result.commits;

  return { ...result, commits: [copyCommit(first), ...rest.map(copyCommit)] };
}

function pruneExpiredEntries(now: number) {
  for (const [cacheKey, cached] of commitSearchCache) {
    if (cached.expiresAt <= now) {
      commitSearchCache.delete(cacheKey);
    }
  }
}

function pruneOldestEntries() {
  while (commitSearchCache.size > COMMIT_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestCacheKey = commitSearchCache.keys().next().value;
    if (oldestCacheKey === undefined) return;
    commitSearchCache.delete(oldestCacheKey);
  }
}

export function getCachedCommitSearch(cacheKey: string, now = Date.now()) {
  const cached = commitSearchCache.get(cacheKey);

  if (!cached) return null;

  if (cached.expiresAt <= now) {
    commitSearchCache.delete(cacheKey);
    return null;
  }

  commitSearchCache.delete(cacheKey);
  commitSearchCache.set(cacheKey, cached);

  return copyCommitSearchResult(cached.result);
}

export function setCachedCommitSearch(cacheKey: string, result: CommitData, now = Date.now()) {
  if (!result.found && result.errorKind !== "empty") return;
  // A partial result would otherwise be served as definitive for the whole TTL,
  // and would evict a complete result already cached for this user.
  if (result.incomplete) return;

  pruneExpiredEntries(now);
  commitSearchCache.set(cacheKey, {
    expiresAt: now + COMMIT_SEARCH_CACHE_TTL_MS,
    result: copyCommitSearchResult(result),
  });
  pruneOldestEntries();
}

export function clearCommitSearchCache() {
  commitSearchCache.clear();
}
