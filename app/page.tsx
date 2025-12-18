'use client'

import React, { useState, useTransition } from 'react';
import { getFirstCommit, FirstCommitData } from './actions';
import FirstCommitDisplay from '@/components/FirstCommitDisplay';
import { FaGithub } from "react-icons/fa";

export default function Home() {
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<FirstCommitData | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    startTransition(async () => {
       const data = await getFirstCommit(username.trim());
       setResult(data);
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--background)] font-sans">
      {/* Header */}
      <header className="py-4 px-6 border-b border-[var(--github-border)] bg-[var(--github-gray-light)] flex items-center justify-between">
         <div className="flex items-center gap-2 font-bold text-xl text-[var(--github-gray-dark)]">
            <FaGithub className="text-3xl" />
            <span>MyFirstCommit</span>
         </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-4xl mx-auto">
        
        {(!result?.found) && (
            <div className={`text-center mb-8 transition-all duration-500 ${isPending ? 'opacity-50' : 'opacity-100'}`}>
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
                <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username"
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
        {result?.found && result.commit && (
            <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <FirstCommitDisplay data={result.commit} />
                
                <div className="text-center mt-12">
                    <button 
                        onClick={() => { setResult(null); setUsername(''); }}
                        className="px-4 py-2 text-sm font-semibold text-[var(--github-gray-dark)] bg-[var(--github-gray-light)] border border-[var(--github-border)] rounded-md hover:bg-gray-100 transition-colors shadow-sm"
                    >
                        Search another user
                    </button>
                </div>
            </div>
        )}

      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-[var(--github-border)] text-center text-xs text-[var(--github-gray-text)] bg-[var(--github-gray-light)]">
        <p>&copy; {new Date().getFullYear()} MyFirstCommit Clone. Not affiliated with GitHub.</p>
      </footer>
    </div>
  );
}