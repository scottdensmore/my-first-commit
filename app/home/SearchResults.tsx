import { GoCopy } from "react-icons/go";
import FirstCommitDisplay from "@/components/FirstCommitDisplay";
import type { CommitInfo } from "../commitTypes";
import { getRepositoryUrl } from "./sharedSearch";

type SearchResultsProps = {
  commits: CommitInfo[];
  lastSearchedUsername: string;
  shareStatus: string;
  onCopy: () => void;
};

export default function SearchResults({
  commits,
  lastSearchedUsername,
  shareStatus,
  onCopy,
}: SearchResultsProps) {
  const firstCommit = commits[0];
  if (!firstCommit) return null;

  const uniqueRepositoryCount = new Set(
    commits.map((commit) => commit.repository.full_name),
  ).size;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex flex-col items-center pb-12 pt-8">
      <div className="mb-6 w-full max-w-2xl text-left">
        <h1 className="text-2xl font-bold text-[var(--github-gray-dark)]">
          First public commit found
        </h1>
        <p className="mt-2 text-sm text-[var(--github-gray-dark)]">
          Earliest indexed public commit for @{lastSearchedUsername} appears in{" "}
          <a
            href={getRepositoryUrl(firstCommit.repository.full_name)}
            className="font-semibold text-[var(--github-blue)] hover:underline"
          >
            {firstCommit.repository.full_name}
          </a>
          {uniqueRepositoryCount > 1
            ? `, with nearby early commits across ${uniqueRepositoryCount} repositories.`
            : "."}
        </p>
        <p className="mt-2 text-sm text-[var(--github-gray-text)]">
          GitHub search may miss older commits when indexing is incomplete,
          delayed, or author metadata changed.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--github-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--github-gray-dark)] shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
          >
            <GoCopy aria-hidden="true" />
            Copy result
          </button>
          {shareStatus ? (
            <span
              role="status"
              aria-live="polite"
              className="text-sm font-medium text-[var(--github-gray-text)]"
            >
              {shareStatus}
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative w-full max-w-2xl">
        <div className="absolute bottom-0 left-8 top-10 -z-10 hidden w-0.5 bg-[var(--github-border)] sm:block" />

        <div className="flex flex-col gap-0">
          <div className="mb-8 flex gap-4">
            <div className="mt-12 hidden flex-col items-center sm:flex">
              <div className="h-4 w-4 rounded-sm border border-[var(--github-green-hover)] bg-[var(--github-green)] shadow-sm" />
            </div>
            <div className="min-w-0 flex-1">
              <FirstCommitDisplay data={firstCommit} isMain />
            </div>
          </div>

          {commits.slice(1).map((commit) => (
            <div
              key={`${commit.repository.full_name}-${commit.sha}`}
              className="mb-4 flex gap-4"
            >
              <div className="mt-8 hidden flex-col items-center sm:flex">
                <div className="h-4 w-4 rounded-sm border border-[var(--github-green-hover)] bg-[var(--github-green)] opacity-70 shadow-sm" />
              </div>
              <div className="min-w-0 flex-1">
                <FirstCommitDisplay data={commit} isMain={false} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
