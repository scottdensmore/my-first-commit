import { getUsernameValidationMessage } from "../username";
import { MAX_RECENT_SEARCHES, RECENT_SEARCHES_STORAGE_KEY } from "./constants";

// Recent searches are a best-effort convenience. Reading or writing them can
// fail on corrupt data or a blocked localStorage (private mode, quota, or a
// security policy); none of that should break the page, so we swallow the
// failure and fall back to an empty/no-op result.

export function getStoredRecentSearches() {
  if (typeof window === "undefined") return [];

  try {
    const storedSearches = JSON.parse(
      window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(storedSearches)) return [];

    return storedSearches
      .filter(
        (search): search is string =>
          typeof search === "string" && !getUsernameValidationMessage(search),
      )
      .slice(0, MAX_RECENT_SEARCHES);
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
