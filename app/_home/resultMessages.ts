import type { CommitSearchFailure } from "../_lib/commitTypes";

// Every helper here takes a failure rather than a result. They are only ever reached from the
// error panel and the failed-retry path, and taking the union would mean each one re-deciding what
// a success means -- which is what let `errorKind` be read off a successful result at all.

type ResultMessage = {
  title: string;
  description: string;
};

export function getResultMessage(result: CommitSearchFailure): ResultMessage {
  switch (result.errorKind) {
    case "rate_limit":
      return {
        title: "GitHub is asking us to slow down.",
        description:
          "GitHub temporarily limited commit search requests. Wait a few minutes, then try this username again.",
      };
    case "timeout":
      return {
        title: "GitHub took too long to respond.",
        description:
          "The request timed out before GitHub finished searching. Try again now, or give GitHub a moment if it keeps happening.",
      };
    case "unavailable":
      return {
        title: "GitHub search is temporarily unavailable.",
        description:
          "GitHub returned a temporary service error. Your search is safe to retry once GitHub recovers.",
      };
    case "validation":
      return {
        title: "GitHub could not validate that search.",
        description:
          "Check the username and try again. GitHub may reject searches for users that do not exist or cannot be searched.",
      };
    case "empty":
      // An incomplete search proves nothing about whether commits exist, so it must not
      // be reported as an absence of them.
      return result.incomplete
        ? {
            title: "GitHub could not finish this search.",
            description:
              "The search timed out before scanning every commit, so nothing came back yet. Try again in a moment.",
          }
        : {
            title: "No public commits found.",
            description:
              "Try another username or check back later; GitHub commit search indexing can lag.",
          };
    default:
      return {
        title: "We could not complete that search.",
        description: result.error,
      };
  }
}

/**
 * Copy for a retry that failed while an earlier partial result is still on screen.
 * `getResultMessage` cannot be reused here: it is written as standalone panel prose,
 * so it runs to several sentences and its empty-search wording claims nothing came
 * back -- which would contradict the commits rendered directly below the message.
 */
export function getRetryFailureMessage(result: CommitSearchFailure): string {
  switch (result.errorKind) {
    case "rate_limit":
      return "GitHub is rate limiting searches right now, so wait a few minutes before searching again.";
    case "timeout":
      return "GitHub took too long to respond again, so give it a moment before retrying.";
    case "unavailable":
      return "GitHub search is still unavailable.";
    case "empty":
      return "GitHub could not finish the search again.";
    default:
      return "That search did not finish.";
  }
}

export function canRetryCommitSearch(result: CommitSearchFailure | null) {
  return (
    Boolean(result?.incomplete) ||
    result?.errorKind === "rate_limit" ||
    result?.errorKind === "timeout" ||
    result?.errorKind === "unavailable" ||
    result?.errorKind === "unknown"
  );
}

export function isEmptyCommitSearchResult(result: CommitSearchFailure | null) {
  return result?.errorKind === "empty";
}
