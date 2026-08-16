import { useEffect, useRef } from "react";
import { GoCopy } from "react-icons/go";
import FirstCommitDisplay from "./FirstCommitDisplay";
import { githubRepositoryUrl } from "../_lib/githubUrls";
import type { CommitInfo } from "../_lib/commitTypes";

const PARTIAL_RESULT_HEADING_ID = "partial-result-heading";
const PARTIAL_RESULT_DESCRIPTION_ID = "partial-result-description";
const RETRY_OUTCOME_ID = "partial-result-retry-outcome";

type PartialResultRetry = {
  isRetrying: boolean;
  error: string;
  stillPartial: boolean;
  onRetry: (username: string) => void;
};

type SearchResultsProps = {
  // The non-empty tuple, not a plain array: this view has no meaningful empty state, and taking
  // the array meant carrying an early return that could never fire.
  commits: [CommitInfo, ...CommitInfo[]];
  lastSearchedUsername: string;
  shareStatus: string;
  isIncomplete: boolean;
  retry: PartialResultRetry;
  onCopy: () => void;
};

export default function SearchResults({
  commits,
  lastSearchedUsername,
  shareStatus,
  isIncomplete,
  retry,
  onCopy,
}: SearchResultsProps) {
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstCommit = commits[0];

  // Keyed on what changed rather than on object identity: a retry that comes back partial
  // again returns a fresh object for the same commit, and focusing the heading on that
  // would throw the visitor back to the top of the result and drown the announcement
  // explaining what just happened.
  const firstCommitSha = firstCommit.sha;
  useEffect(() => {
    resultHeadingRef.current?.focus();
  }, [firstCommitSha, lastSearchedUsername, isIncomplete]);

  const uniqueRepositoryCount = new Set(commits.map((commit) => commit.repository.full_name)).size;
  // A retry changes nothing else on screen when it comes back still partial, so every
  // outcome is spoken here rather than left to be inferred from the button's label.
  const retryOutcome = retry.error
    ? `${retry.error} The commits below are still the earlier partial result.`
    : retry.stillPartial
      ? "Searched again. GitHub still returned a partial result, so an earlier commit may still be missing."
      : "";
  const headingDescription = [PARTIAL_RESULT_DESCRIPTION_ID, retryOutcome ? RETRY_OUTCOME_ID : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="w-full flex flex-col items-center pb-12 pt-8">
      <div className="mb-6 w-full max-w-2xl text-left">
        <h1
          ref={resultHeadingRef}
          tabIndex={-1}
          aria-describedby={isIncomplete ? headingDescription : undefined}
          className="rounded-sm text-2xl font-bold text-[var(--github-gray-dark)] focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2"
        >
          {isIncomplete ? "Earliest public commit found so far" : "First public commit found"}
        </h1>
        {/* A GitHub handle is an unbreakable 40-character token, which overflows the panel at
            a 320px viewport -- the same width 200% zoom produces on a 640px window. */}
        <p className="mt-2 text-sm break-words text-[var(--github-gray-dark)]">
          Earliest indexed public commit for @{lastSearchedUsername} appears in{" "}
          <a
            href={githubRepositoryUrl(firstCommit.repository.full_name)}
            className="font-semibold text-[var(--github-blue)] hover:underline"
          >
            {firstCommit.repository.full_name}
          </a>
          {uniqueRepositoryCount > 1
            ? `, with nearby early commits across ${uniqueRepositoryCount} repositories.`
            : "."}
        </p>
        {isIncomplete ? (
          // The caveat is announced through the heading's description rather than a live
          // region: the block mounts with its content already inside it, which screen
          // readers often skip, while the heading reliably takes focus when results arrive.
          <section
            aria-labelledby={PARTIAL_RESULT_HEADING_ID}
            className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-5 text-amber-900 shadow-sm"
          >
            <h2 id={PARTIAL_RESULT_HEADING_ID} className="text-base font-semibold">
              GitHub returned a partial result
            </h2>
            {/* Sets up the button directly below it. Pointing at the header's "Search
                another user" instead would clear the very handle being reused. */}
            <p id={PARTIAL_RESULT_DESCRIPTION_ID} className="mt-2 text-sm break-words">
              The search timed out before scanning every commit, so an earlier commit may be
              missing. Searching again often reaches the full history.
            </p>
            <button
              type="button"
              onClick={() => {
                if (retry.isRetrying) return;
                retry.onRetry(lastSearchedUsername);
              }}
              // aria-disabled rather than disabled: a disabled control loses focus the
              // moment it is pressed, stranding a keyboard user mid-action.
              aria-disabled={retry.isRetrying}
              className="mt-4 inline-flex items-center justify-center rounded-md border border-amber-700 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2 focus:ring-offset-amber-50 aria-disabled:cursor-not-allowed aria-disabled:bg-amber-50 aria-disabled:hover:bg-amber-50"
            >
              {retry.isRetrying ? "Searching again..." : "Search again"}
            </button>
            {/* One region, mounted whether or not it has anything to say: a live region
                inserted together with its text is commonly not announced at all, and a
                separate visible copy of the same message would be read twice. It sits
                below the button so a wrapping message cannot push the control out from
                under a visitor about to press it again. */}
            <div role="status" aria-live="polite">
              {retry.isRetrying ? (
                <span className="sr-only">Searching GitHub again for {lastSearchedUsername}.</span>
              ) : null}
              {retryOutcome ? (
                <p
                  id={RETRY_OUTCOME_ID}
                  className="mt-3 rounded-md border border-amber-700 bg-white p-3 text-sm font-semibold break-words"
                >
                  {retryOutcome}
                </p>
              ) : null}
            </div>
          </section>
        ) : (
          <p className="mt-2 text-sm text-[var(--github-gray-text)]">
            GitHub search may miss older commits when indexing is incomplete, delayed, or author
            metadata changed.
          </p>
        )}
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
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-8 top-10 -z-10 hidden w-0.5 bg-[var(--github-border)] sm:block"
        />

        {/* An ordered list, because the order is the point -- these are the earliest commits, and
            the first one is the answer. Without it assistive technology gets repeated card-shaped
            groups of divs with no count and no sense of sequence.

            `role="list"` is not redundant. Tailwind's preflight sets `list-style: none` on `ol`,
            and Safari with VoiceOver drops list semantics from a list styled that way, so the
            explicit role is what keeps the announcement in the browser this app now tests. */}
        <ol role="list" aria-label="Earliest public commits" className="flex flex-col gap-0">
          <li className="mb-8 flex gap-4">
            <div aria-hidden="true" className="mt-12 hidden flex-col items-center sm:flex">
              <div className="h-4 w-4 rounded-sm border border-[var(--github-green-hover)] bg-[var(--github-green)] shadow-sm" />
            </div>
            <div className="min-w-0 flex-1">
              <FirstCommitDisplay data={firstCommit} isMain />
            </div>
          </li>

          {commits.slice(1).map((commit) => (
            <li key={`${commit.repository.full_name}-${commit.sha}`} className="mb-4 flex gap-4">
              <div aria-hidden="true" className="mt-8 hidden flex-col items-center sm:flex">
                <div className="h-4 w-4 rounded-sm border border-[var(--github-green-hover)] bg-[var(--github-green)] opacity-70 shadow-sm" />
              </div>
              <div className="min-w-0 flex-1">
                <FirstCommitDisplay data={commit} isMain={false} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
