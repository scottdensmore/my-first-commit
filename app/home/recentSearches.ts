import { getUsernameValidationMessage } from "../username";
import {
  isRecoverableStorageReadError,
  isRecoverableStorageWriteError,
} from "./browserErrors";
import {
  MAX_RECENT_SEARCHES,
  RECENT_SEARCHES_STORAGE_KEY,
} from "./constants";

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
  } catch (error) {
    if (isRecoverableStorageReadError(error)) {
      return [];
    }

    throw error;
  }
}

export function saveStoredRecentSearches(searches: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      RECENT_SEARCHES_STORAGE_KEY,
      JSON.stringify(searches),
    );
  } catch (error) {
    if (isRecoverableStorageWriteError(error)) {
      return;
    }

    throw error;
  }
}

export function clearStoredRecentSearches() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch (error) {
    if (isRecoverableStorageWriteError(error)) {
      return;
    }

    throw error;
  }
}
