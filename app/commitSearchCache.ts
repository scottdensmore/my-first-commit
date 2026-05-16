import type { CommitData } from "./actions";

const COMMIT_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  result: CommitData;
};

const commitSearchCache = new Map<string, CacheEntry>();

export function getCachedCommitSearch(cacheKey: string, now = Date.now()) {
  const cached = commitSearchCache.get(cacheKey);

  if (!cached) return null;

  if (cached.expiresAt <= now) {
    commitSearchCache.delete(cacheKey);
    return null;
  }

  return cached.result;
}

export function setCachedCommitSearch(cacheKey: string, result: CommitData, now = Date.now()) {
  if (!result.found && result.errorKind !== "empty") return;

  commitSearchCache.set(cacheKey, {
    expiresAt: now + COMMIT_SEARCH_CACHE_TTL_MS,
    result,
  });
}

export function clearCommitSearchCache() {
  commitSearchCache.clear();
}

