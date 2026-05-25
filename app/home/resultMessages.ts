import type { CommitData } from "../commitTypes";

type ResultMessage = {
  title: string;
  description: string;
};

export function getResultMessage(result: CommitData): ResultMessage {
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
      return {
        title: "No public commits found.",
        description:
          "Try another username or check back later; GitHub commit search indexing can lag.",
      };
    default:
      return {
        title: "We could not complete that search.",
        description:
          result.error ?? "GitHub commit search failed. Please try again.",
      };
  }
}

export function canRetryCommitSearch(result: CommitData | null) {
  return (
    result?.errorKind === "rate_limit" ||
    result?.errorKind === "timeout" ||
    result?.errorKind === "unavailable" ||
    result?.errorKind === "unknown"
  );
}

export function isEmptyCommitSearchResult(result: CommitData | null) {
  return result?.errorKind === "empty";
}
