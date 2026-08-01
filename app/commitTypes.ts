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
  commits: CommitInfo[];
};
