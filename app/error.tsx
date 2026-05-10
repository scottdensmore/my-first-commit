"use client";

import Link from "next/link";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <main className="min-h-screen bg-white text-[var(--github-gray-dark)]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-normal text-[var(--github-gray-text)]">
          Something went wrong
        </p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
          We lost the commit trail.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--github-gray-text)]">
          The app hit an unexpected error. You can try again without losing your place.
        </p>

        {error.digest && (
          <p className="mt-4 rounded border border-[var(--github-border)] bg-[var(--github-gray-light)] px-3 py-2 font-mono text-xs text-[var(--github-gray-text)]">
            Error reference: {error.digest}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-[var(--github-green)] px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-[var(--github-border)] px-5 py-3 text-base font-semibold text-[var(--github-gray-dark)] transition-colors hover:bg-[var(--github-gray-light)] focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
