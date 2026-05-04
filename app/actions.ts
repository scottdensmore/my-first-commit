'use server'

import { Octokit } from "octokit";

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN 
});

type GitHubErrorDetails = {
  message?: string;
  rateLimitRemaining?: string;
  rateLimitReset?: string;
  status?: unknown;
};

export interface CommitInfo {
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
}

export interface CommitData {
  found: boolean;
  error?: string;
  commits: CommitInfo[];
}

function getGitHubErrorDetails(error: unknown): GitHubErrorDetails {
  if (typeof error !== "object" || error === null) {
    return {};
  }

  const status = "status" in error ? error.status : undefined;
  const message = error instanceof Error ? error.message : undefined;
  const headers = "response" in error
    && typeof error.response === "object"
    && error.response !== null
    && "headers" in error.response
    && typeof error.response.headers === "object"
    && error.response.headers !== null
      ? error.response.headers as Record<string, string | undefined>
      : undefined;

  return {
    message,
    rateLimitRemaining: headers?.["x-ratelimit-remaining"],
    rateLimitReset: headers?.["x-ratelimit-reset"],
    status,
  };
}

export async function getCommits(username: string): Promise<CommitData> {
  if (!username) return { found: false, error: "Username is required", commits: [] };

  try {
    const response = await octokit.rest.search.commits({
      q: `author:${username}`,
      sort: 'committer-date',
      order: 'asc',
      per_page: 10
    });

    const items = response.data.items;

    if (!items || items.length === 0) {
      return { found: false, error: "No public commits found for this user (or indexing is delayed).", commits: [] };
    }

    const commits = items.map(item => ({
        message: item.commit.message,
        date: item.commit.author?.date || item.commit.committer?.date || "",
        html_url: item.html_url,
        sha: item.sha,
        repository: {
          name: item.repository.name,
          owner: item.repository.owner.login,
          full_name: item.repository.full_name
        },
        author: {
          login: item.author?.login || username,
          avatar_url: item.author?.avatar_url || "https://github.com/ghost.png",
          html_url: item.author?.html_url || `https://github.com/${username}`
        }
    }));

    return {
      found: true,
      commits: commits
    };

  } catch (error: unknown) {
    let errorMessage = "Failed to fetch commits.";
    const errorDetails = getGitHubErrorDetails(error);
    const { status } = errorDetails;

    if (status === 403) {
      console.warn("github_commit_search_rate_limited", {
        username,
        status,
        rateLimitRemaining: errorDetails.rateLimitRemaining,
        rateLimitReset: errorDetails.rateLimitReset,
      });
      errorMessage = "GitHub rate limit reached. Please try again in a few minutes.";
    } else {
      console.error("github_commit_search_failed", {
        username,
        status,
        message: errorDetails.message,
      });
    }

    if (status === 422) errorMessage = "Validation failed. User might not exist.";
    
    return { found: false, error: errorMessage, commits: [] };
  }
}
