'use client'

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { getCommits, CommitData } from './actions';
import FirstCommitDisplay from '@/components/FirstCommitDisplay';
import { FaGithub } from "react-icons/fa";

export default function Home() {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<CommitData | null>(null);
  const [isPending, startTransition] = useTransition();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!result?.found) {
      searchInputRef.current?.focus();
    }
  }, [result?.found]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    startTransition(async () => {
       const data = await getCommits(username.trim());
       setResult(data);
    });
  };

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
                onClick={() => { setResult(null); setUsername(''); }}
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
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="block w-full pl-7 pr-3 py-3 border border-[var(--github-border)] rounded-md leading-5 bg-white text-[var(--github-gray-dark)] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:border-transparent sm:text-sm shadow-sm"
                    autoFocus
                />
            </div>
            <button
                type="submit"
                disabled={isPending || !username.trim()}
                className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-[var(--github-green)] hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--github-green)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
                {isPending ? 'Searching...' : 'Search'}
            </button>
        </form>
        )}

        {/* Error State */}
        {result && !result.found && (
            <div className="mt-8 p-4 rounded-md bg-red-50 border border-red-200 text-red-700 w-full max-w-md text-center animate-pulse">
                {result.error || "User not found or no public commits."}
                <div className="mt-2 text-sm">
                    <button onClick={() => setResult(null)} className="underline hover:no-underline">Try again</button>
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
