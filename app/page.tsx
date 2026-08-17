"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { trackAppEvent } from "./_lib/analytics";
import { EXAMPLE_USERNAMES } from "./_home/constants";
import SearchErrorState from "./_home/SearchErrorState";
import SearchForm from "./_home/SearchForm";
import SearchResults from "./_home/SearchResults";
import SearchShortcutSection from "./_home/SearchShortcutSection";
import { useCommitSearch } from "./_home/useCommitSearch";
import {
  buildResultShareText,
  clearSharedSearchUrl,
  getInitialSharedUsername,
} from "./_home/sharedSearch";
import { getUsernameValidationMessage } from "./_lib/username";
const APP_RELEASE = process.env.NEXT_PUBLIC_APP_RELEASE ?? "local";
const APP_RELEASE_URL = process.env.NEXT_PUBLIC_APP_RELEASE_URL ?? "";

export default function Home() {
  const [username, setUsername] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const {
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
  } = useCommitSearch();

  const focusSearchInput = () => {
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  useEffect(() => {
    if (!result?.found) {
      searchInputRef.current?.focus();
    }
  }, [result?.found]);

  useEffect(() => {
    const sharedUsername = getInitialSharedUsername();
    if (!sharedUsername) return;

    const autoSearch = window.setTimeout(() => {
      setUsername(sharedUsername);
      runSearch(sharedUsername);
    }, 0);

    return () => window.clearTimeout(autoSearch);
  }, [runSearch]);

  const handleClearRecentSearches = () => {
    clearRecentSearches();
    focusSearchInput();
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    runSearch(username, { updateUrl: true });
  };

  const resetSearch = () => {
    cancelPendingSearch();
    setResult(null);
    setShareStatus("");
    clearSharedSearchUrl();
    focusSearchInput();
  };

  const startNewSearch = () => {
    cancelPendingSearch();
    setResult(null);
    setUsername("");
    setLastSearchedUsername("");
    setShareStatus("");
    clearSharedSearchUrl();
    focusSearchInput();
  };

  const handleShortcutSearch = (shortcutUsername: string) => {
    setUsername(shortcutUsername);
    runSearch(shortcutUsername, { updateUrl: true });
  };

  const usernameValidationMessage = getUsernameValidationMessage(username);
  const canSearch = Boolean(username.trim()) && !usernameValidationMessage && !isSearching;

  const copyResult = async () => {
    if (!result?.found || !navigator.clipboard) {
      setShareStatus("Copy is not available in this browser.");
      trackAppEvent("result_copy_unavailable");
      return;
    }

    try {
      await navigator.clipboard.writeText(buildResultShareText(lastSearchedUsername, result));
      setShareStatus("Result copied.");
      trackAppEvent("result_copied");
    } catch {
      // Clipboard writes can fail on permissions or unsupported browsers;
      // surface a fallback message instead of letting the rejection bubble up.
      setShareStatus("Could not copy result. Use the commit link instead.");
      trackAppEvent("result_copy_failed");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] font-sans">
      {/* Header */}
      <header
        aria-label="Site header"
        className="sticky top-0 z-50 py-3 px-6 border-b border-[var(--github-border)] bg-[var(--github-gray-light)] flex items-center justify-between backdrop-blur-sm bg-white/80"
      >
        <div className="flex items-center gap-2 font-bold text-xl text-[var(--github-gray-dark)]">
          <FaGithub className="text-3xl" />
          <span>My First Commit</span>
        </div>
        {result?.found ? (
          <button
            onClick={startNewSearch}
            className="rounded-md border border-[var(--github-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--github-gray-dark)] shadow-sm transition-colors hover:bg-gray-50"
          >
            Search another user
          </button>
        ) : null}
      </header>

      {/* Main */}
      <main
        aria-label="Commit search"
        className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center p-4"
      >
        {!result?.found ? (
          <div
            className={`mb-8 mt-20 text-center transition-all duration-500 ${isSearching ? "opacity-50" : "opacity-100"}`}
          >
            <h1 className="mb-4 text-3xl font-extrabold tracking-tight text-[var(--github-gray-dark)] sm:text-5xl">
              Discover your origin.
            </h1>
            <p className="text-lg text-[var(--github-gray-text)]">
              Enter your GitHub username to find your very first public commit.
            </p>
          </div>
        ) : null}

        {!result?.found ? (
          <SearchForm
            username={username}
            validationMessage={usernameValidationMessage}
            canSearch={canSearch}
            isPending={isSearching}
            searchInputRef={searchInputRef}
            onSubmit={handleSearch}
            onUsernameChange={setUsername}
          />
        ) : null}

        {!result?.found && recentSearches.length > 0 ? (
          <SearchShortcutSection
            title="Recent searches"
            usernames={recentSearches}
            isPending={isSearching}
            onSearch={handleShortcutSearch}
            getButtonLabel={(recentUsername) => `@${recentUsername}`}
            buttonAriaLabel={(recentUsername) => `Search ${recentUsername} again`}
            onClear={handleClearRecentSearches}
          />
        ) : null}

        {!result ? (
          <SearchShortcutSection
            title="Examples"
            usernames={EXAMPLE_USERNAMES}
            isPending={isSearching}
            onSearch={handleShortcutSearch}
            getButtonLabel={(exampleUsername) => `@${exampleUsername}`}
            buttonAriaLabel={(exampleUsername) => `Search example username ${exampleUsername}`}
          />
        ) : null}

        {isSearching && !result ? (
          <div
            role="status"
            aria-live="polite"
            className="mt-5 w-full max-w-md rounded-md border border-[var(--github-border)] bg-[var(--github-gray-light)] px-4 py-3 text-sm text-[var(--github-gray-text)]"
          >
            Searching GitHub for {lastSearchedUsername}...
          </div>
        ) : null}

        {result && !result.found ? (
          <SearchErrorState
            result={result}
            exampleUsernames={EXAMPLE_USERNAMES}
            isPending={isSearching}
            lastSearchedUsername={lastSearchedUsername}
            onRetry={(searchUsername) => runSearch(searchUsername, { isRetry: true })}
            onReset={resetSearch}
            onExampleSearch={handleShortcutSearch}
          />
        ) : null}

        {result?.found ? (
          <SearchResults
            commits={result.commits}
            lastSearchedUsername={lastSearchedUsername}
            shareStatus={shareStatus}
            isIncomplete={Boolean(result.incomplete)}
            retry={{
              isRetrying,
              error: retryError,
              stillPartial: retryStillPartial,
              onRetry: (searchUsername) => runSearch(searchUsername, { isRetry: true }),
            }}
            onCopy={copyResult}
          />
        ) : null}
      </main>

      {/* Footer */}
      <footer
        aria-label="Privacy and GitHub affiliation"
        className="border-t border-[var(--github-border)] bg-[var(--github-gray-light)] px-4 py-6 text-center text-xs text-[var(--github-gray-text)]"
      >
        <p className="mx-auto mb-2 max-w-2xl">
          Privacy: searches are sent to GitHub to find public commits. Recent searches stay in this
          browser only and are not stored on this app&apos;s server.{" "}
          <Link href="/privacy" className="font-semibold text-[var(--github-blue)] hover:underline">
            Read the privacy note
          </Link>
          .
        </p>
        <p>
          &copy; {new Date().getFullYear()} Not affiliated with GitHub.{" "}
          {APP_RELEASE_URL ? (
            <a
              href={APP_RELEASE_URL}
              className="font-semibold text-[var(--github-blue)] hover:underline"
            >
              Release {APP_RELEASE}
            </a>
          ) : (
            <span>Release {APP_RELEASE}</span>
          )}
        </p>
      </footer>
    </div>
  );
}
