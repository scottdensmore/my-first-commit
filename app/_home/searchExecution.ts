import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { getCommits } from "../_lib/actions";
import type { CommitData } from "../_lib/commitTypes";
import { getUsernameValidationMessage, normalizeGitHubUsername } from "../_lib/username";
import { trackAppEvent } from "./analytics";
import { MAX_RECENT_SEARCHES } from "./constants";
import { saveStoredRecentSearches } from "./recentSearches";
import { updateSharedSearchUrl } from "./sharedSearch";

type SearchSource = "user" | "shared_url" | "retry";

type SearchOptions = {
  updateUrl?: boolean;
  source?: SearchSource;
};

type SearchHandlers = {
  isLatestSearch: () => boolean;
  startTransition: TransitionStartFunction;
  setLastSearchedUsername: Dispatch<SetStateAction<string>>;
  setShareStatus: Dispatch<SetStateAction<string>>;
  // Takes the settled search rather than a state action: the caller decides whether a
  // failed retry replaces what is on screen, which it cannot do from inside an updater.
  // It is the single settle signal, so the caller can clear its own busy flag here.
  applyResult: (result: CommitData) => void;
  setRecentSearches: Dispatch<SetStateAction<string[]>>;
};

function unexpectedSearchError(): CommitData {
  return {
    found: false,
    error: "GitHub commit search failed. Please try again.",
    errorKind: "unknown",
    commits: [],
  };
}

/**
 * Returns whether the search actually started. A caller that owns a busy flag must gate
 * it on this: the guards below reject a username without ever settling, which would
 * otherwise leave the UI busy with nothing in flight to clear it.
 */
export function runCommitSearch(
  searchUsername: string,
  options: SearchOptions = {},
  {
    isLatestSearch,
    startTransition,
    setLastSearchedUsername,
    setShareStatus,
    applyResult,
    setRecentSearches,
  }: SearchHandlers,
): boolean {
  const trimmedUsername = normalizeGitHubUsername(searchUsername);
  if (!trimmedUsername) return false;
  if (getUsernameValidationMessage(trimmedUsername)) return false;
  if (options.updateUrl) updateSharedSearchUrl(trimmedUsername);

  trackAppEvent("search_submitted", {
    source: options.source ?? (options.updateUrl ? "user" : "shared_url"),
  });
  setLastSearchedUsername(trimmedUsername);
  setShareStatus("");
  startTransition(async () => {
    let data: CommitData;
    try {
      data = await getCommits(trimmedUsername);
    } catch {
      data = unexpectedSearchError();
    }
    if (!isLatestSearch()) return;

    applyResult(data);
    trackAppEvent("search_completed", {
      found: data.found,
      error_kind: data.errorKind ?? "none",
      commit_count: data.commits.length,
      incomplete: Boolean(data.incomplete),
    });
    if (data.found) {
      setRecentSearches((currentSearches) => {
        const nextSearches = [
          trimmedUsername,
          ...currentSearches.filter(
            (search) => search.toLowerCase() !== trimmedUsername.toLowerCase(),
          ),
        ].slice(0, MAX_RECENT_SEARCHES);

        saveStoredRecentSearches(nextSearches);
        return nextSearches;
      });
    }
  });

  return true;
}
