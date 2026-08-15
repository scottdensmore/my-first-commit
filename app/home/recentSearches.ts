import { getUsernameValidationMessage, normalizeGitHubUsername } from "../username";
import { MAX_RECENT_SEARCHES, RECENT_SEARCHES_STORAGE_KEY } from "./constants";

// Recent searches are a best-effort convenience. Reading or writing them can
// fail on corrupt data or a blocked localStorage (private mode, quota, or a
// security policy); none of that should break the page, so we swallow the
// failure and fall back to an empty/no-op result.

/**
 * Anything may be in storage: hand-edited entries, or values written by another tool using the
 * same key. This app only ever adds a trimmed, validated handle, so junk does not originate here
 * -- though before this sanitizer it could be re-persisted, since a blank that survived the read
 * was written back with the rest of the list on the next successful search. Each entry is
 * trimmed, validated, and deduplicated before it can reach the shortcut buttons.
 *
 * The cap is applied last. Applying it first would let junk consume slots and return fewer
 * shortcuts than the visitor actually has.
 */
function sanitizeStoredSearches(storedSearches: unknown[]) {
  const seen = new Set<string>();
  const searches: string[] = [];

  for (const storedSearch of storedSearches) {
    if (typeof storedSearch !== "string") continue;

    const username = normalizeGitHubUsername(storedSearch);
    // `getUsernameValidationMessage` reports no problem with an empty value on purpose: the
    // search form must not show an error before anything has been typed. Storage has no such
    // excuse, so emptiness is rejected here rather than inferred from a missing message --
    // that inference is what let blank entries render as bare `@` shortcuts.
    if (!username || getUsernameValidationMessage(username)) continue;

    const duplicateKey = username.toLowerCase();
    if (seen.has(duplicateKey)) continue;

    seen.add(duplicateKey);
    searches.push(username);
    if (searches.length === MAX_RECENT_SEARCHES) break;
  }

  return searches;
}

export function getStoredRecentSearches() {
  if (typeof window === "undefined") return [];

  try {
    const storedSearches: unknown = JSON.parse(
      window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(storedSearches)) return [];

    return sanitizeStoredSearches(storedSearches);
  } catch {
    return [];
  }
}

export function saveStoredRecentSearches(searches: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Ignore storage write failures.
  }
}

export function clearStoredRecentSearches() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch {
    // Ignore storage write failures.
  }
}
