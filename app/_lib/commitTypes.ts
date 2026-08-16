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

export type CommitData = {
  found: boolean;
  error?: string;
  errorKind?: CommitErrorKind;
  /**
   * GitHub reported `incomplete_results`, meaning the search timed out before
   * scanning every commit. An earlier commit may exist that this result misses,
   * so partial results are surfaced to the visitor and never cached.
   */
  incomplete?: boolean;
  commits: CommitInfo[];
};
