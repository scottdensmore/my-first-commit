import type { FormEvent, RefObject } from "react";

type SearchFormProps = {
  username: string;
  validationMessage: string;
  canSearch: boolean;
  isPending: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onSubmit: (event: FormEvent) => void;
  onUsernameChange: (value: string) => void;
};

export default function SearchForm({
  username,
  validationMessage,
  canSearch,
  isPending,
  searchInputRef,
  onSubmit,
  onUsernameChange,
}: SearchFormProps) {
  const usernameDescriptionIds = validationMessage
    ? "username-hint username-validation"
    : "username-hint";

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="GitHub commit search"
      aria-busy={isPending}
      className="w-full max-w-md flex flex-col gap-2 sm:flex-row"
    >
      <div className="relative flex-1">
        <label htmlFor="commit-search" className="sr-only">
          GitHub username
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-[var(--github-gray-text)]">
            <span className="font-mono text-sm">@</span>
          </div>
          <input
            ref={searchInputRef}
            id="commit-search"
            name="commit-search"
            type="search"
            value={username}
            onInput={(event) => onUsernameChange(event.currentTarget.value)}
            placeholder="username"
            aria-describedby={usernameDescriptionIds}
            aria-invalid={Boolean(validationMessage)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            className={`block h-12 w-full rounded-md border bg-white py-3 pl-7 pr-3 leading-5 text-[var(--github-gray-dark)] placeholder-gray-400 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 sm:text-sm ${validationMessage ? "border-red-300 focus:ring-red-500" : "border-[var(--github-border)] focus:ring-[var(--github-blue)]"}`}
            autoFocus
          />
        </div>
        <p id="username-hint" className="mt-2 text-xs text-[var(--github-gray-text)]">
          GitHub usernames can use letters, numbers, or single hyphens.
        </p>
        {validationMessage ? (
          <p
            id="username-validation"
            role="status"
            aria-live="polite"
            className="mt-2 text-xs font-medium text-red-700"
          >
            {validationMessage}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={!canSearch}
        className="inline-flex h-12 items-center justify-center rounded-md border border-transparent bg-[var(--github-green)] px-6 text-base font-medium text-white shadow-sm transition-colors hover:bg-[var(--github-green-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--github-green)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:self-start"
      >
        {isPending ? "Searching..." : "Search"}
      </button>
    </form>
  );
}
