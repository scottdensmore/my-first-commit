'use client'

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { getCommits, CommitData } from './actions';
import { getUsernameValidationMessage, normalizeGitHubUsername } from "./username";
import FirstCommitDisplay from '@/components/FirstCommitDisplay';
import { track } from "@vercel/analytics";
import { FaGithub } from "react-icons/fa";
import { GoCopy } from "react-icons/go";

const RECENT_SEARCHES_STORAGE_KEY = "my-first-commit:recent-searches";
const MAX_RECENT_SEARCHES = 5;
const EXAMPLE_USERNAMES = ["octocat", "torvalds", "gaearon"];
const APP_RELEASE = process.env.NEXT_PUBLIC_APP_RELEASE ?? "local";
const APP_RELEASE_URL = process.env.NEXT_PUBLIC_APP_RELEASE_URL ?? "";

function trackAppEvent(name: string, properties?: Record<string, string | number | boolean>) {
  try {
    track(name, properties);
  } catch {
    // Analytics should never interrupt the search experience.
  }
}

function updateSharedSearchUrl(username: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("user", username);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function clearSharedSearchUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("user");
  const search = url.searchParams.toString();
  window.history.replaceState(null, "", `${url.pathname}${search ? `?${search}` : ""}${url.hash}`);
}

function getInitialSharedUsername() {
  if (typeof window === "undefined") return "";

  return new URLSearchParams(window.location.search).get("user") ?? "";
}

function getStoredRecentSearches() {
  if (typeof window === "undefined") return [];

  try {
    const storedSearches = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(storedSearches)) return [];

    return storedSearches
      .filter((search): search is string => typeof search === "string" && !getUsernameValidationMessage(search))
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function saveStoredRecentSearches(searches: string[]) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Recent searches are a convenience only; searches should still succeed without storage.
  }
}

function clearStoredRecentSearches() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
  } catch {
    // Recent searches are optional and should not affect the search flow.
  }
}

function getResultMessage(result: CommitData) {
  switch (result.errorKind) {
    case "rate_limit":
      return {
        title: "GitHub is asking us to slow down.",
        description: "GitHub temporarily limited commit search requests. Wait a few minutes, then try this username again.",
      };
    case "timeout":
      return {
        title: "GitHub took too long to respond.",
        description: "The request timed out before GitHub finished searching. Try again now, or give GitHub a moment if it keeps happening.",
      };
    case "unavailable":
      return {
        title: "GitHub search is temporarily unavailable.",
        description: "GitHub returned a temporary service error. Your search is safe to retry once GitHub recovers.",
      };
    case "validation":
      return {
        title: "GitHub could not validate that search.",
        description: "Check the username and try again. GitHub may reject searches for users that do not exist or cannot be searched.",
      };
    case "empty":
      return {
        title: "No public commits found.",
        description: "Try another username or check back later; GitHub commit search indexing can lag.",
      };
    default:
      return {
        title: "We could not complete that search.",
        description: result.error ?? "GitHub commit search failed. Please try again.",
      };
  }
}

function getRepositoryUrl(fullName: string) {
  return `https://github.com/${fullName}`;
}

function buildResultShareText(username: string, result: CommitData) {
  const firstCommit = result.commits[0];
  const firstLine = firstCommit.message.split("\n")[0];

  return [
    `${username}'s first public commit: ${firstLine}`,
    `Repository: ${firstCommit.repository.full_name}`,
    `Commit: ${firstCommit.html_url}`,
    `Search: ${window.location.href}`,
  ].join("\n");
}

export default function Home() {
  const [username, setUsername] = useState(getInitialSharedUsername);
  const [result, setResult] = useState<CommitData | null>(null);
  const [lastSearchedUsername, setLastSearchedUsername] = useState('');
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

  const rememberRecentSearch = useCallback((searchedUsername: string) => {
    setRecentSearches((currentSearches) => {
      const nextSearches = [
        searchedUsername,
        ...currentSearches.filter((search) => search.toLowerCase() !== searchedUsername.toLowerCase()),
      ].slice(0, MAX_RECENT_SEARCHES);

      saveStoredRecentSearches(nextSearches);
      return nextSearches;
    });
  }, []);

  const clearRecentSearches = () => {
    setRecentSearches([]);
    clearStoredRecentSearches();
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const searchCommits = useCallback((searchUsername: string, options: { updateUrl?: boolean } = {}) => {
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
        rememberRecentSearch(trimmedUsername);
       }
    });
  }, [rememberRecentSearch]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchCommits(username, { updateUrl: true });
  };

  const resetSearch = () => {
    setResult(null);
    setShareStatus("");
    clearSharedSearchUrl();
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  useEffect(() => {
    const sharedUsername = new URLSearchParams(window.location.search).get("user");
    if (!sharedUsername) return;

    const autoSearch = window.setTimeout(() => {
      searchCommits(sharedUsername);
    }, 0);

    return () => window.clearTimeout(autoSearch);
  }, [searchCommits]);

  const isEmptyResult = result?.errorKind === "empty";
  const canRetrySearch = result?.errorKind === "rate_limit"
    || result?.errorKind === "timeout"
    || result?.errorKind === "unavailable"
    || result?.errorKind === "unknown";
  const resultMessage = result && !result.found ? getResultMessage(result) : null;
  const resultStateRole = isEmptyResult ? "status" : "alert";
  const usernameValidationMessage = getUsernameValidationMessage(username);
  const usernameDescriptionIds = usernameValidationMessage
    ? "username-hint username-validation"
    : "username-hint";
  const canSearch = Boolean(username.trim()) && !usernameValidationMessage && !isPending;
  const firstCommit = result?.found ? result.commits[0] : null;
  const uniqueRepositoryCount = result?.found
    ? new Set(result.commits.map((commit) => commit.repository.full_name)).size
    : 0;

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
      setShareStatus("Could not copy result. Use the commit link instead.");
      trackAppEvent("result_copy_failed");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] font-sans">
      {/* Header */}
      <header aria-label="Site header" className="sticky top-0 z-50 py-3 px-6 border-b border-[var(--github-border)] bg-[var(--github-gray-light)] flex items-center justify-between backdrop-blur-sm bg-white/80">
         <div className="flex items-center gap-2 font-bold text-xl text-[var(--github-gray-dark)]">
            <FaGithub className="text-3xl" />
            <span>My First Commit</span>
         </div>
         {result?.found && (
            <button 
                onClick={() => { setResult(null); setUsername(''); setLastSearchedUsername(''); setShareStatus(''); clearSharedSearchUrl(); }}
                className="px-3 py-1.5 text-xs font-semibold text-[var(--github-gray-dark)] bg-white border border-[var(--github-border)] rounded-md hover:bg-gray-50 transition-colors shadow-sm"
            >
                Search another user
            </button>
         )}
      </header>

      {/* Main */}
      <main aria-label="Commit search" className="flex-1 flex flex-col items-center p-4 w-full max-w-4xl mx-auto">
        
        {(!result?.found) && (
            <div className={`text-center mb-8 mt-20 transition-all duration-500 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[var(--github-gray-dark)] mb-4">
                    Discover your origin.
                </h1>
                <p className="text-lg text-[var(--github-gray-text)]">
                    Enter your GitHub username to find your very first public commit.
                </p>
            </div>
        )}

        {/* Search Form */}
        {!result?.found && (
        <form
            onSubmit={handleSearch}
            role="search"
            aria-label="GitHub commit search"
            aria-busy={isPending}
            className="w-full max-w-md flex flex-col sm:flex-row gap-2"
        >
            <div className="relative flex-1">
                <label htmlFor="commit-search" className="sr-only">
                    GitHub username
                </label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-[var(--github-gray-text)]">
                        <span className="font-mono text-sm">@</span>
                    </div>
                    <input
                        ref={searchInputRef}
                        id="commit-search"
                        name="commit-search"
                        type="search"
                        value={username}
                        onInput={(e) => setUsername(e.currentTarget.value)}
                        placeholder="username"
                        aria-describedby={usernameDescriptionIds}
                        aria-invalid={Boolean(usernameValidationMessage)}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        className={`block h-12 w-full rounded-md border bg-white py-3 pl-7 pr-3 leading-5 text-[var(--github-gray-dark)] placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:border-transparent sm:text-sm ${usernameValidationMessage ? 'border-red-300 focus:ring-red-500' : 'border-[var(--github-border)] focus:ring-[var(--github-blue)]'}`}
                        autoFocus
                    />
                </div>
                <p id="username-hint" className="mt-2 text-xs text-[var(--github-gray-text)]">
                    GitHub usernames can use letters, numbers, or single hyphens.
                </p>
                {usernameValidationMessage && (
                    <p id="username-validation" role="status" aria-live="polite" className="mt-2 text-xs font-medium text-red-700">
                        {usernameValidationMessage}
                    </p>
                )}
            </div>
            <button
                type="submit"
                disabled={!canSearch}
                className="inline-flex h-12 items-center justify-center rounded-md border border-transparent bg-[var(--github-green)] px-6 text-base font-medium text-white shadow-sm transition-colors hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--github-green)] disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
            >
                {isPending ? 'Searching...' : 'Search'}
            </button>
        </form>
        )}

        {!result?.found && recentSearches.length > 0 && (
            <section aria-labelledby="recent-searches-heading" className="mt-4 w-full max-w-md">
                <div className="flex items-center justify-between gap-3">
                    <h2 id="recent-searches-heading" className="text-xs font-semibold uppercase tracking-normal text-[var(--github-gray-text)]">
                        Recent searches
                    </h2>
                    <button
                        type="button"
                        onClick={clearRecentSearches}
                        aria-label="Clear recent searches"
                        className="text-xs font-medium text-[var(--github-gray-text)] hover:text-[var(--github-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2 rounded-sm"
                    >
                        Clear
                    </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                    {recentSearches.map((recentUsername) => (
                        <button
                            key={recentUsername}
                            type="button"
                            onClick={() => {
                                setUsername(recentUsername);
                                searchCommits(recentUsername, { updateUrl: true });
                            }}
                            className="inline-flex items-center justify-center rounded-md border border-[var(--github-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--github-gray-dark)] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
                            aria-label={`Search ${recentUsername} again`}
                        >
                            @{recentUsername}
                        </button>
                    ))}
                </div>
            </section>
        )}

        {!result && (
            <section aria-labelledby="examples-heading" className="mt-6 w-full max-w-md">
                <h2 id="examples-heading" className="text-xs font-semibold uppercase tracking-normal text-[var(--github-gray-text)]">
                    Examples
                </h2>
                <div className="mt-2 flex flex-wrap gap-2">
                    {EXAMPLE_USERNAMES.map((exampleUsername) => (
                        <button
                            key={exampleUsername}
                            type="button"
                            onClick={() => {
                                setUsername(exampleUsername);
                                searchCommits(exampleUsername, { updateUrl: true });
                            }}
                            className="inline-flex items-center justify-center rounded-md border border-[var(--github-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--github-gray-dark)] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
                            aria-label={`Search example username ${exampleUsername}`}
                        >
                            @{exampleUsername}
                        </button>
                    ))}
                </div>
            </section>
        )}

        {isPending && !result && (
            <div role="status" aria-live="polite" className="mt-5 w-full max-w-md rounded-md border border-[var(--github-border)] bg-[var(--github-gray-light)] px-4 py-3 text-sm text-[var(--github-gray-text)]">
                Searching GitHub for {lastSearchedUsername}...
            </div>
        )}

        {/* Empty and Error States */}
        {result && !result.found && (
            <div role={resultStateRole} aria-live={isEmptyResult ? "polite" : undefined} className={`mt-8 w-full max-w-md rounded-md border p-5 text-left shadow-sm ${isEmptyResult ? 'border-[var(--github-border)] bg-[var(--github-gray-light)] text-[var(--github-gray-dark)]' : 'border-red-200 bg-red-50 text-red-800'}`}>
                <h2 className="text-base font-semibold text-[var(--github-gray-dark)]">
                    {resultMessage?.title}
                </h2>
                <p className="mt-2 text-sm text-[var(--github-gray-text)]">
                    {resultMessage?.description}
                </p>
                {isEmptyResult && (
                    <div className="mt-4 rounded-md border border-[var(--github-border)] bg-white p-3">
                        <h3 className="text-sm font-semibold text-[var(--github-gray-dark)]">
                            Check a known public profile
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {EXAMPLE_USERNAMES.map((exampleUsername) => (
                                <button
                                    key={exampleUsername}
                                    type="button"
                                    onClick={() => {
                                        setUsername(exampleUsername);
                                        searchCommits(exampleUsername, { updateUrl: true });
                                    }}
                                    className="inline-flex items-center justify-center rounded-md border border-[var(--github-border)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--github-gray-dark)] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
                                    aria-label={`Search example username ${exampleUsername}`}
                                >
                                    @{exampleUsername}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                    {canRetrySearch && (
                        <button
                            type="button"
                            onClick={() => searchCommits(lastSearchedUsername)}
                            disabled={isPending || !lastSearchedUsername}
                            className="inline-flex items-center justify-center rounded-md bg-[var(--github-green)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--github-green)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Try again
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={resetSearch}
                        className="inline-flex items-center justify-center rounded-md border border-[var(--github-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--github-gray-dark)] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
                    >
                        Edit username
                    </button>
                </div>
            </div>
        )}

        {/* Result State */}
        {result?.found && result.commits.length > 0 && (
            <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 pt-8">
                <div className="mb-6 w-full max-w-2xl text-left">
                    <h1 className="text-2xl font-bold text-[var(--github-gray-dark)]">
                        First public commit found
                    </h1>
                    {firstCommit && (
                        <p className="mt-2 text-sm text-[var(--github-gray-dark)]">
                            Earliest indexed public commit for @{lastSearchedUsername} appears in{" "}
                            <a href={getRepositoryUrl(firstCommit.repository.full_name)} className="font-semibold text-[var(--github-blue)] hover:underline">
                                {firstCommit.repository.full_name}
                            </a>
                            {uniqueRepositoryCount > 1 ? `, with nearby early commits across ${uniqueRepositoryCount} repositories.` : "."}
                        </p>
                    )}
                    <p className="mt-2 text-sm text-[var(--github-gray-text)]">
                        GitHub search may miss older commits when indexing is incomplete, delayed, or author metadata changed.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={copyResult}
                            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--github-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--github-gray-dark)] shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
                        >
                            <GoCopy aria-hidden="true" />
                            Copy result
                        </button>
                        {shareStatus && (
                            <span role="status" aria-live="polite" className="text-sm font-medium text-[var(--github-gray-text)]">
                                {shareStatus}
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="w-full max-w-2xl relative">
                    {/* The "Graph" Line */}
                    <div className="absolute left-8 top-10 bottom-0 w-0.5 bg-[var(--github-border)] -z-10 hidden sm:block"></div>
                    
                    <div className="flex flex-col gap-0">
                        {/* First Commit */}
                        <div className="flex gap-4 mb-8">
                            <div className="hidden sm:flex flex-col items-center mt-12">
                                <div className="w-4 h-4 rounded-sm bg-[var(--github-green)] border border-[var(--github-green-hover)] shadow-sm"></div>
                            </div>
                            <div className="flex-1 min-w-0">
                                <FirstCommitDisplay data={result.commits[0]} isMain={true} />
                            </div>
                        </div>

                        {/* Subsequent Commits */}
                        {result.commits.slice(1).map((commit) => (
                            <div key={`${commit.repository.full_name}-${commit.sha}`} className="flex gap-4 mb-4">
                                <div className="hidden sm:flex flex-col items-center mt-8">
                                    <div className="w-4 h-4 rounded-sm bg-[var(--github-green)] opacity-70 border border-[var(--github-green-hover)] shadow-sm"></div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <FirstCommitDisplay data={commit} isMain={false} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

      </main>

      {/* Footer */}
      <footer aria-label="Privacy and GitHub affiliation" className="border-t border-[var(--github-border)] bg-[var(--github-gray-light)] px-4 py-6 text-center text-xs text-[var(--github-gray-text)]">
        <p className="mx-auto mb-2 max-w-2xl">
            Privacy: searches are sent to GitHub to find public commits. Recent searches stay in this browser only and are not stored on this app&apos;s server.{" "}
            <a href="/privacy" className="font-semibold text-[var(--github-blue)] hover:underline">
                Read the privacy note
            </a>
            .
        </p>
        <p>
            &copy; {new Date().getFullYear()} Not affiliated with GitHub.{" "}
            {APP_RELEASE_URL ? (
                <a href={APP_RELEASE_URL} className="font-semibold text-[var(--github-blue)] hover:underline">
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
