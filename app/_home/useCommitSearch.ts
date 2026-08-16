import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CommitData } from "../commitTypes";
import { clearStoredRecentSearches, getStoredRecentSearches } from "./recentSearches";
import { getRetryFailureMessage } from "./resultMessages";
import { runCommitSearch } from "./searchExecution";

type RunSearchOptions = { updateUrl?: boolean; isRetry?: boolean };

/**
 * Owns the commit-search result lifecycle (result, last-searched username,
 * recent searches, share status, and the busy state) so the page component can
 * trigger a search with a single `runSearch` call instead of threading state
 * setters through every handler.
 *
 * The busy flag is owned here rather than taken from `useTransition`. `isPending`
 * stays true through the tail of a transition and through a search the visitor has
 * abandoned, which would leave the search form disabled with nothing in flight to
 * re-enable it.
 */
export function useCommitSearch() {
  const [result, setResult] = useState<CommitData | null>(null);
  const [lastSearchedUsername, setLastSearchedUsername] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [shareStatus, setShareStatus] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const [retryStillPartial, setRetryStillPartial] = useState(false);
  const [, startTransition] = useTransition();
  const nextSearchIdRef = useRef(0);
  const latestSearchIdRef = useRef(0);
  const resultRef = useRef<CommitData | null>(null);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    const loadRecentSearches = window.setTimeout(() => {
      setRecentSearches(getStoredRecentSearches());
    }, 0);

    return () => window.clearTimeout(loadRecentSearches);
  }, []);

  const runSearch = useCallback((searchUsername: string, options: RunSearchOptions = {}) => {
    // Identity comes from its own counter rather than from the latest-search marker, so
    // it cannot depend on when that marker is assigned. The marker moves separately, and
    // only once the search actually started.
    const searchId = ++nextSearchIdRef.current;
    const isRetry = Boolean(options.isRetry);

    const started = runCommitSearch(
      searchUsername,
      { updateUrl: options.updateUrl, source: isRetry ? "retry" : undefined },
      {
        isLatestSearch: () => searchId === latestSearchIdRef.current,
        startTransition,
        setLastSearchedUsername,
        setShareStatus,
        applyResult: (data) => {
          setIsSearching(false);
          setIsRetrying(false);

          // A retry launched from the results view must not destroy the result the
          // visitor is reading: a shared rate limit or timeout would otherwise replace
          // their commits with an error screen for taking the retry the UI offered.
          if (isRetry && !data.found && resultRef.current?.found) {
            setRetryError(getRetryFailureMessage(data));
            return;
          }

          // "Still" is only true if the previous result was itself partial. A retry from
          // the error panel starts from a failure, so a first partial answer there is
          // news rather than a repeat.
          if (isRetry && data.found && data.incomplete && resultRef.current?.incomplete) {
            setRetryStillPartial(true);
          }
          setResult(data);
        },
        setRecentSearches,
      },
    );

    // Only claim the search once the layer below accepted it; a rejected username
    // never settles, so a busy flag set here would never clear.
    if (!started) return;

    // Assigned after the call, which is safe only because `isLatestSearch` is first
    // consulted after an await. A synchronous check would read the previous value and
    // make the search discard itself.
    latestSearchIdRef.current = searchId;
    setIsSearching(true);
    setIsRetrying(isRetry);
    setRetryError("");
    setRetryStillPartial(false);
  }, []);

  // Reset controls clear the result but cannot clear an in-flight request. Without this
  // a slow search resolving afterwards would remount results over the page the visitor
  // moved to, and the busy flag would outlive the search by up to the GitHub timeout.
  const cancelPendingSearch = useCallback(() => {
    latestSearchIdRef.current = ++nextSearchIdRef.current;
    setIsSearching(false);
    setIsRetrying(false);
    setRetryError("");
    setRetryStillPartial(false);
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
    isSearching,
    isRetrying,
    retryError,
    retryStillPartial,
    runSearch,
    cancelPendingSearch,
  };
}
