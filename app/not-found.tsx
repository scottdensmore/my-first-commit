import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white text-[var(--github-gray-dark)]">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-normal text-[var(--github-gray-text)]">
          404
        </p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
          This commit path does not exist.
        </h1>
        <p className="mt-4 max-w-xl text-lg text-[var(--github-gray-text)]">
          The page may have moved, or the link may have been copied incorrectly.
        </p>
        <Link
          href="/"
          className="mt-8 rounded-md bg-[var(--github-green)] px-5 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
