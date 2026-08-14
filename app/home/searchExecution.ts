import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { getCommits } from "../actions";
import type { CommitData } from "../commitTypes";
import { getUsernameValidationMessage, normalizeGitHubUsername } from "../username";
import { trackAppEvent } from "./analytics";
import { MAX_RECENT_SEARCHES } from "./constants";
import { saveStoredRecentSearches } from "./recentSearches";
import { updateSharedSearchUrl } from "./sharedSearch";

type SearchHandlers = {
  isLatestSearch: () => boolean;
  startTransition: TransitionStartFunction;
  setLastSearchedUsername: Dispatch<SetStateAction<string>>;
  setShareStatus: Dispatch<SetStateAction<string>>;
  setResult: Dispatch<SetStateAction<CommitData | null>>;
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

export function runCommitSearch(
  searchUsername: string,
  options: { updateUrl?: boolean } = {},
  {
    isLatestSearch,
    startTransition,
    setLastSearchedUsername,
    setShareStatus,
    setResult,
    setRecentSearches,
  }: SearchHandlers,
) {
  const trimmedUsername = normalizeGitHubUsername(searchUsername);
  if (!trimmedUsername) return;
  if (getUsernameValidationMessage(trimmedUsername)) return;
  if (options.updateUrl) updateSharedSearchUrl(trimmedUsername);

  trackAppEvent("search_submitted", {
    source: options.updateUrl ? "user" : "shared_url",
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

    setResult(data);
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
}
