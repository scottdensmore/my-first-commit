type SearchShortcutSectionProps = {
  title: string;
  usernames: string[];
  isPending: boolean;
  onSearch: (username: string) => void;
  getButtonLabel: (username: string) => string;
  buttonAriaLabel: (username: string) => string;
  onClear?: () => void;
};

export default function SearchShortcutSection({
  title,
  usernames,
  isPending,
  onSearch,
  getButtonLabel,
  buttonAriaLabel,
  onClear,
}: SearchShortcutSectionProps) {
  if (usernames.length === 0) return null;

  return (
    <section
      aria-labelledby={`${title.toLowerCase().replace(/\s+/g, "-")}-heading`}
      aria-busy={isPending}
      className="mt-4 w-full max-w-md"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id={`${title.toLowerCase().replace(/\s+/g, "-")}-heading`}
          className="text-xs font-semibold uppercase tracking-normal text-[var(--github-gray-text)]"
        >
          {title}
        </h2>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            disabled={isPending}
            aria-label="Clear recent searches"
            className="rounded-sm text-xs font-medium text-[var(--github-gray-text)] hover:text-[var(--github-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {usernames.map((username) => (
          <button
            key={username}
            type="button"
            disabled={isPending}
            onClick={() => onSearch(username)}
            // A GitHub handle is an unbreakable 39-character token, so at a 320px viewport --
            // the width 200% zoom produces on a 640px window -- one shortcut is wider than the
            // page and scrolls it sideways. Wrapping inside the button keeps it a single tap
            // target with one focus ring, which truncating would also do but at the cost of
            // hiding the end of the handle.
            //
            // `break-all`, not `break-words`: the label is an anonymous flex item, whose
            // automatic minimum size is its min-content width. `overflow-wrap: break-word`
            // wraps text but leaves that width at the whole token, so the item refuses to
            // shrink and the label overruns its own padding instead. `word-break: break-all`
            // lowers it to one character, which is what lets `max-w-full` take effect.
            className="inline-flex max-w-full items-center justify-center rounded-md border border-[var(--github-border)] bg-white px-3 py-1.5 text-sm font-medium break-all text-[var(--github-gray-dark)] hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--github-blue)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={buttonAriaLabel(username)}
          >
            {getButtonLabel(username)}
          </button>
        ))}
      </div>
    </section>
  );
}
