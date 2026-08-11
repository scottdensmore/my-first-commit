import type { CommitData } from "../commitTypes";
import {
  canRetryCommitSearch,
  getResultMessage,
  isEmptyCommitSearchResult,
} from "./resultMessages";
import SearchShortcutSection from "./SearchShortcutSection";

type SearchErrorStateProps = {
  result: CommitData;
  exampleUsernames: string[];
  isPending: boolean;
  lastSearchedUsername: string;
  onRetry: (username: string) => void;
  onReset: () => void;
  onExampleSearch: (username: string) => void;
};

export default function SearchErrorState({
  result,
  exampleUsernames,
  isPending,
  lastSearchedUsername,
  onRetry,
  onReset,
  onExampleSearch,
}: SearchErrorStateProps) {
  const isEmptyResult = isEmptyCommitSearchResult(result);
  const canRetry = canRetryCommitSearch(result);
  const resultMessage = getResultMessage(result);

  return (
    <div
      role={isEmptyResult ? "status" : "alert"}
      aria-live={isEmptyResult ? "polite" : undefined}
      className={`mt-8 w-full max-w-md rounded-md border p-5 text-left shadow-sm ${isEmptyResult ? "border-[var(--github-border)] bg-[var(--github-gray-light)] text-[var(--github-gray-dark)]" : "border-red-200 bg-red-50 text-red-800"}`}
    >
      <h2 className="text-base font-semibold text-[var(--github-gray-dark)]">
        {resultMessage.title}
      </h2>
      <p className="mt-2 text-sm text-[var(--github-gray-text)]">{resultMessage.description}</p>
      {isEmptyResult ? (
        <div className="mt-4 rounded-md border border-[var(--github-border)] bg-white p-3">
          <h3 className="text-sm font-semibold text-[var(--github-gray-dark)]">
            Check a known public profile
          </h3>
          <SearchShortcutSection
            title="Examples"
            usernames={exampleUsernames}
            isPending={isPending}
            onSearch={onExampleSearch}
            getButtonLabel={(username) => `@${username}`}
            buttonAriaLabel={(username) => `Search example username ${username}`}
          />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {canRetry ? (
          <button
            type="button"
            onClick={() => onRetry(lastSearchedUsername)}
            disabled={isPending || !lastSearchedUsername}
            className="inline-flex items-center justify-center rounded-md bg-[var(--github-green)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--github-green)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Try again
          </button>
        ) : null}
        <button
          type="button"
          onClick={onReset}
          disabled={isPending}
          className="inline-flex items-center justify-center rounded-md border border-[var(--github-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--github-gray-dark)] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Edit username
        </button>
      </div>
    </div>
  );
}
