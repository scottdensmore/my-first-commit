"use client";

import type { FormEvent } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import type { CommitData } from "./commitTypes";
import { trackAppEvent } from "./home/analytics";
import { EXAMPLE_USERNAMES } from "./home/constants";
import { isRecoverableClipboardWriteError } from "./home/browserErrors";
import SearchErrorState from "./home/SearchErrorState";
import SearchForm from "./home/SearchForm";
import SearchResults from "./home/SearchResults";
import SearchShortcutSection from "./home/SearchShortcutSection";
import { clearStoredRecentSearches, getStoredRecentSearches } from "./home/recentSearches";
import { runCommitSearch } from "./home/searchExecution";
import {
  buildResultShareText,
  clearSharedSearchUrl,
  getInitialSharedUsername,
} from "./home/sharedSearch";
import { getUsernameValidationMessage } from "./username";
const APP_RELEASE = process.env.NEXT_PUBLIC_APP_RELEASE ?? "local";
const APP_RELEASE_URL = process.env.NEXT_PUBLIC_APP_RELEASE_URL ?? "";

export default function Home() {
  const initialSharedUsername = getInitialSharedUsername();
  const [username, setUsername] = useState(initialSharedUsername);
  const [result, setResult] = useState<CommitData | null>(null);
  const [lastSearchedUsername, setLastSearchedUsername] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [shareStatus, setShareStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadRecentSearches = window.setTimeout(() => {
      setRecentSearches(getStoredRecentSearches());
    }, 0);

    return () => window.clearTimeout(loadRecentSearches);
  }, []);

  useEffect(() => {
    if (!result?.found) {
      searchInputRef.current?.focus();
    }
  }, [result?.found]);

  const clearRecentSearches = () => {
    setRecentSearches([]);
    clearStoredRecentSearches();
    focusSearchInput();
  };

  useEffect(() => {
    const sharedUsername = getInitialSharedUsername();
    if (!sharedUsername) return;

    const autoSearch = window.setTimeout(() => {
      runCommitSearch(sharedUsername, undefined, {
        startTransition,
        setLastSearchedUsername,
        setShareStatus,
        setResult,
        setRecentSearches,
      });
    }, 0);

    return () => window.clearTimeout(autoSearch);
  }, [startTransition]);

  const focusSearchInput = () => {
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    runCommitSearch(
      username,
      { updateUrl: true },
      {
        startTransition,
        setLastSearchedUsername,
        setShareStatus,
        setResult,
        setRecentSearches,
      },
    );
  };

  const resetSearch = () => {
    setResult(null);
    setShareStatus("");
    clearSharedSearchUrl();
    focusSearchInput();
  };

  const startNewSearch = () => {
    setResult(null);
    setUsername("");
    setLastSearchedUsername("");
    setShareStatus("");
    clearSharedSearchUrl();
    focusSearchInput();
  };

  const handleShortcutSearch = (shortcutUsername: string) => {
    setUsername(shortcutUsername);
    runCommitSearch(
      shortcutUsername,
      { updateUrl: true },
      {
        startTransition,
        setLastSearchedUsername,
        setShareStatus,
        setResult,
        setRecentSearches,
      },
    );
  };

  const usernameValidationMessage = getUsernameValidationMessage(username);
  const canSearch = Boolean(username.trim()) && !usernameValidationMessage && !isPending;

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
    } catch (error) {
      if (!isRecoverableClipboardWriteError(error)) {
        throw error;
      }

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
            className={`mb-8 mt-20 text-center transition-all duration-500 ${isPending ? "opacity-50" : "opacity-100"}`}
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
            isPending={isPending}
            searchInputRef={searchInputRef}
            onSubmit={handleSearch}
            onUsernameChange={setUsername}
          />
        ) : null}

        {!result?.found && recentSearches.length > 0 ? (
          <SearchShortcutSection
            title="Recent searches"
            usernames={recentSearches}
            onSearch={handleShortcutSearch}
            getButtonLabel={(recentUsername) => `@${recentUsername}`}
            buttonAriaLabel={(recentUsername) => `Search ${recentUsername} again`}
            onClear={clearRecentSearches}
          />
        ) : null}

        {!result ? (
          <SearchShortcutSection
            title="Examples"
            usernames={EXAMPLE_USERNAMES}
            onSearch={handleShortcutSearch}
            getButtonLabel={(exampleUsername) => `@${exampleUsername}`}
            buttonAriaLabel={(exampleUsername) => `Search example username ${exampleUsername}`}
          />
        ) : null}

        {isPending && !result ? (
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
            isPending={isPending}
            lastSearchedUsername={lastSearchedUsername}
            onRetry={(searchUsername) =>
              runCommitSearch(searchUsername, undefined, {
                startTransition,
                setLastSearchedUsername,
                setShareStatus,
                setResult,
                setRecentSearches,
              })
            }
            onReset={resetSearch}
            onExampleSearch={handleShortcutSearch}
          />
        ) : null}

        {result?.found && result.commits.length > 0 ? (
          <SearchResults
            commits={result.commits}
            lastSearchedUsername={lastSearchedUsername}
            shareStatus={shareStatus}
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
