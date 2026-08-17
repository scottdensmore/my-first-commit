export type CommitInfo = {
  message: string;
  date: string;
  html_url: string;
  sha: string;
  repository: {
    name: string;
    owner: string;
    full_name: string;
  };
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  };
};

export type CommitErrorKind =
  "empty" | "rate_limit" | "timeout" | "unavailable" | "validation" | "unknown";

/**
 * A search that found commits. The tuple is the invariant: a successful result with an empty list
 * was representable before, and every consumer paid for it with a defensive check that could never
 * fire -- `result.found && result.commits.length > 0` in the page, a `if (!firstCommit) return null`
 * in the results view. `found` alone is now enough.
 */
export type CommitSearchSuccess = {
  found: true;
  commits: [CommitInfo, ...CommitInfo[]];
  /**
   * GitHub reported `incomplete_results`, meaning the search timed out before scanning every
   * commit. An earlier commit may exist that this result misses, so partial results are surfaced
   * to the visitor and never cached.
   */
  incomplete?: boolean;
};

/**
 * A search that returned nothing usable. `error` and `errorKind` are required rather than optional:
 * every failure the server action produces carries both, and leaving them optional meant each
 * reader deciding for itself what an absent kind meant.
 *
 * `incomplete` lives on both variants deliberately. A search can time out before scanning every
 * commit and return nothing, which is a failure the visitor should be told is unfinished rather
 * than told is an absence of commits.
 */
export type CommitSearchFailure = {
  found: false;
  commits: [];
  error: string;
  errorKind: CommitErrorKind;
  incomplete?: boolean;
};

/**
 * Discriminated on `found`, so narrowing gives a reader the right shape without a cast and makes
 * an impossible combination -- a failure kind on a success, commits on a failure -- fail to
 * compile rather than fail a runtime check somebody remembered to write.
 *
 * The wire format is unchanged. Tuples are erased at runtime, so what the Server Action serializes
 * is the same JSON it always was, and a result cached by an older instance still deserializes.
 */
export type CommitData = CommitSearchSuccess | CommitSearchFailure;

/**
 * The two failure messages the search reaches for when GitHub returns nothing usable. They live
 * beside the constructor that carries them, and are shared rather than copied because the browser
 * fixtures assert on the same wording: a second copy would let the real path and the fixture path
 * describe the same outcome differently, which is the drift `commitSearchMocksEnabled` exists to
 * prevent one level down.
 */
export const EMPTY_COMMIT_SEARCH_MESSAGE =
  "No public commits found for this user (or indexing is delayed).";
export const INCOMPLETE_COMMIT_SEARCH_MESSAGE =
  "GitHub could not finish this search, so no commits were returned yet.";

/**
 * Builds a failure. Paired here with `toCommitSearchSuccess` below so both constructors of the
 * union live with the union, and so callers outside the server action can build one -- a
 * `"use server"` module cannot export a synchronous helper, which is what put this here rather
 * than leaving it in `actions.ts`.
 */
export function commitSearchError(
  error: string,
  errorKind: CommitErrorKind,
  incomplete = false,
): CommitSearchFailure {
  return { found: false, error, errorKind, ...(incomplete ? { incomplete } : {}), commits: [] };
}

/**
 * Builds a success, or returns `null` when there is nothing to succeed with.
 *
 * This exists so the non-empty invariant is established in exactly one place. TypeScript does not
 * narrow `CommitInfo[]` to a non-empty tuple from a `length === 0` check, so without it every
 * construction site would need its own assertion -- and an assertion is a promise the compiler
 * cannot keep. Callers turn `null` into whichever empty-result message fits their context.
 */
export function toCommitSearchSuccess(
  commits: CommitInfo[],
  options: { incomplete?: boolean } = {},
): CommitSearchSuccess | null {
  const [first, ...rest] = commits;

  if (!first) return null;

  return {
    found: true,
    commits: [first, ...rest],
    ...(options.incomplete ? { incomplete: true } : {}),
  };
}
