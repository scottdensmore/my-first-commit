'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { getCommits, CommitData } from './actions';
import FirstCommitDisplay from '@/components/FirstCommitDisplay';
import { FaGithub } from "react-icons/fa";

function getUsernameValidationMessage(value: string) {
  const username = value.trim();

  if (!username) return "";
  if (username.length > 39) return "GitHub usernames must be 39 characters or fewer.";
  if (!/^[a-zA-Z0-9-]+$/.test(username)) return "Use only letters, numbers, and hyphens.";
  if (username.startsWith("-") || username.endsWith("-")) return "GitHub usernames cannot start or end with a hyphen.";
  if (username.includes("--")) return "GitHub usernames cannot include consecutive hyphens.";

  return "";
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

export default function Home() {
  const [username, setUsername] = useState(getInitialSharedUsername);
  const [result, setResult] = useState<CommitData | null>(null);
  const [lastSearchedUsername, setLastSearchedUsername] = useState('');
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!result?.found) {
      searchInputRef.current?.focus();
    }
  }, [result?.found]);

  const searchCommits = (searchUsername: string, options: { updateUrl?: boolean } = {}) => {
    const trimmedUsername = searchUsername.trim();
    if (!trimmedUsername) return;
    if (getUsernameValidationMessage(trimmedUsername)) return;
    if (options.updateUrl) updateSharedSearchUrl(trimmedUsername);

    setLastSearchedUsername(trimmedUsername);
    startTransition(async () => {
       const data = await getCommits(trimmedUsername);
       setResult(data);
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchCommits(username, { updateUrl: true });
  };

  const resetSearch = () => {
    setResult(null);
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
  }, []);

  const errorMessage = result && !result.found ? result.error ?? "User not found or no public commits." : "";
  const isRateLimited = result?.errorKind === "rate_limit";
  const isEmptyResult = result?.errorKind === "empty";
  const resultStateRole = isEmptyResult ? "status" : "alert";
  const usernameValidationMessage = getUsernameValidationMessage(username);
  const canSearch = Boolean(username.trim()) && !usernameValidationMessage && !isPending;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 py-3 px-6 border-b border-[var(--github-border)] bg-[var(--github-gray-light)] flex items-center justify-between backdrop-blur-sm bg-white/80">
         <div className="flex items-center gap-2 font-bold text-xl text-[var(--github-gray-dark)]">
            <FaGithub className="text-3xl" />
            <span>My First Commit</span>
         </div>
         {result?.found && (
            <button 
                onClick={() => { setResult(null); setUsername(''); setLastSearchedUsername(''); clearSharedSearchUrl(); }}
                className="px-3 py-1.5 text-xs font-semibold text-[var(--github-gray-dark)] bg-white border border-[var(--github-border)] rounded-md hover:bg-gray-50 transition-colors shadow-sm"
            >
                Search another user
            </button>
         )}
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center p-4 w-full max-w-4xl mx-auto">
        
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
        <form onSubmit={handleSearch} className="w-full max-w-md flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--github-gray-text)]">
                    <span className="font-mono text-sm">@</span>
                </div>
                <label htmlFor="commit-search" className="sr-only">
                    GitHub username
                </label>
                <input
                    ref={searchInputRef}
                    id="commit-search"
                    name="commit-search"
                    type="search"
                    value={username}
                    onInput={(e) => setUsername(e.currentTarget.value)}
                    placeholder="username"
                    aria-describedby="username-hint username-validation"
                    aria-invalid={Boolean(usernameValidationMessage)}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className={`block w-full pl-7 pr-3 py-3 border rounded-md leading-5 bg-white text-[var(--github-gray-dark)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent sm:text-sm shadow-sm ${usernameValidationMessage ? 'border-red-300 focus:ring-red-500' : 'border-[var(--github-border)] focus:ring-[var(--github-blue)]'}`}
                    autoFocus
                />
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
                className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-[var(--github-green)] hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--github-green)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
                {isPending ? 'Searching...' : 'Search'}
            </button>
        </form>
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
                    {isRateLimited ? "GitHub is asking us to slow down." : isEmptyResult ? "No public commits found." : "We could not complete that search."}
                </h2>
                <p className="mt-2 text-sm text-[var(--github-gray-text)]">
                    {isRateLimited
                        ? "Wait a few minutes, then try again. GitHub temporarily limited commit search requests."
                        : isEmptyResult
                            ? "Try another username or check back later; GitHub commit search indexing can lag."
                            : errorMessage}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                    {isRateLimited && (
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
                            <div key={commit.sha} className="flex gap-4 mb-4">
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
      <footer className="py-6 border-t border-[var(--github-border)] text-center text-xs text-[var(--github-gray-text)] bg-[var(--github-gray-light)]">
        <p>&copy; {new Date().getFullYear()} Not affiliated with GitHub.</p>
      </footer>
    </div>
  );
}
