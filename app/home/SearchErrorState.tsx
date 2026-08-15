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
  // An unfinished search shares the "empty" kind but proves nothing about this username,
  // so pointing the visitor at other profiles would imply a conclusion GitHub never reached.
  const suggestAlternativeProfiles = isEmptyResult && !result.incomplete;
  const cannotRetry = isPending || !lastSearchedUsername;

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
      {suggestAlternativeProfiles ? (
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
            onClick={() => {
              if (cannotRetry) return;
              onRetry(lastSearchedUsername);
            }}
            // aria-disabled rather than disabled: this panel stays mounted through the
            // retry it starts, and a disabled control loses focus the moment it is
            // pressed, stranding a keyboard user mid-action. The label carries the
            // running state, which the surrounding live region announces on its own --
            // a nested region here would say the same thing twice.
            aria-disabled={cannotRetry}
            // No dimming while running, unlike the genuinely inactive control beside it.
            // 1.4.11 exempts inactive components, and a control that still takes focus
            // and still has a live handler is not one; at 50% opacity neither the white
            // label nor the button's boundary clears its contrast threshold.
            className="inline-flex items-center justify-center rounded-md bg-[var(--github-green)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--github-green)] focus:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-[var(--github-green)]"
          >
            {isPending ? "Searching again..." : "Try again"}
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
