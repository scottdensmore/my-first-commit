import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CommitData } from "../commitTypes";
import { clearStoredRecentSearches, getStoredRecentSearches } from "./recentSearches";
import { runCommitSearch } from "./searchExecution";

type RunSearchOptions = { updateUrl?: boolean };

/**
 * Owns the commit-search result lifecycle (result, last-searched username,
 * recent searches, share status, and the pending transition) so the page
 * component can trigger a search with a single `runSearch` call instead of
 * threading state setters through every handler.
 */
export function useCommitSearch() {
  const [result, setResult] = useState<CommitData | null>(null);
  const [lastSearchedUsername, setLastSearchedUsername] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [shareStatus, setShareStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const latestSearchIdRef = useRef(0);

  useEffect(() => {
    const loadRecentSearches = window.setTimeout(() => {
      setRecentSearches(getStoredRecentSearches());
    }, 0);

    return () => window.clearTimeout(loadRecentSearches);
  }, []);

  const runSearch = useCallback((searchUsername: string, options: RunSearchOptions = {}) => {
    const searchId = ++latestSearchIdRef.current;

    runCommitSearch(searchUsername, options, {
      isLatestSearch: () => searchId === latestSearchIdRef.current,
      startTransition,
      setLastSearchedUsername,
      setShareStatus,
      setResult,
      setRecentSearches,
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    clearStoredRecentSearches();
  }, []);

  return {
    result,
    setResult,
    lastSearchedUsername,
    setLastSearchedUsername,
    recentSearches,
    clearRecentSearches,
    shareStatus,
    setShareStatus,
    isPending,
    runSearch,
  };
}
