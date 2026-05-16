import type { CommitData } from "./actions";

const COMMIT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const COMMIT_SEARCH_CACHE_MAX_ENTRIES = 100;

type CacheEntry = {
  expiresAt: number;
  result: CommitData;
};

const commitSearchCache = new Map<string, CacheEntry>();

function copyCommitSearchResult(result: CommitData): CommitData {
  return {
    ...result,
    commits: result.commits.map((commit) => ({
      ...commit,
      repository: { ...commit.repository },
      author: { ...commit.author },
    })),
  };
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
