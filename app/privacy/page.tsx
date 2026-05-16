import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How My First Commit handles GitHub usernames, local recent searches, analytics, and server-side tokens.",
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-12 text-[var(--github-gray-dark)]">
      <article className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-semibold text-[var(--github-blue)] hover:underline">
          Back to search
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Privacy</h1>
        <p className="mt-4 text-base leading-7 text-[var(--github-gray-text)]">
          My First Commit is a small public GitHub search tool. It does not use accounts, a database, or app-owned server-side search history.
        </p>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Searches</h2>
          <p className="mt-3 leading-7 text-[var(--github-gray-text)]">
            Usernames entered into the search form are sent to GitHub so the app can look up public commit data. The app only returns public information that GitHub makes available through its search API.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Recent Searches</h2>
          <p className="mt-3 leading-7 text-[var(--github-gray-text)]">
            Successful searches can appear as recent-search shortcuts. Those shortcuts are stored only in this browser using local storage under <code className="font-mono text-sm">my-first-commit:recent-searches</code>.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Analytics</h2>
          <p className="mt-3 leading-7 text-[var(--github-gray-text)]">
            The app uses Vercel Analytics for basic product health signals, such as page views, search completions, result counts, and error categories. Analytics events do not include the searched GitHub username.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">GitHub Token</h2>
          <p className="mt-3 leading-7 text-[var(--github-gray-text)]">
            If configured, <code className="font-mono text-sm">GITHUB_TOKEN</code> is used only on the server to improve GitHub API reliability. It is never sent to the browser and does not allow private commits to be searched.
          </p>
        </section>
      </article>
    </main>
  );
}
