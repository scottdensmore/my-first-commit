import type { Dispatch, SetStateAction, TransitionStartFunction } from "react";
import { getCommits } from "../actions";
import type { CommitData } from "../commitTypes";
import { getUsernameValidationMessage, normalizeGitHubUsername } from "../username";
import { trackAppEvent } from "./analytics";
import { MAX_RECENT_SEARCHES } from "./constants";
import { saveStoredRecentSearches } from "./recentSearches";
import { updateSharedSearchUrl } from "./sharedSearch";

type SearchHandlers = {
  startTransition: TransitionStartFunction;
  setLastSearchedUsername: Dispatch<SetStateAction<string>>;
  setShareStatus: Dispatch<SetStateAction<string>>;
  setResult: Dispatch<SetStateAction<CommitData | null>>;
  setRecentSearches: Dispatch<SetStateAction<string[]>>;
};

export function runCommitSearch(
  searchUsername: string,
  options: { updateUrl?: boolean } = {},
  {
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
    const data = await getCommits(trimmedUsername);
    setResult(data);
    trackAppEvent("search_completed", {
      found: data.found,
      error_kind: data.errorKind ?? "none",
      commit_count: data.commits.length,
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
