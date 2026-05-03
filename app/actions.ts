'use server'

import { Octokit } from "octokit";

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN 
});

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
    console.error("Error fetching commits:", error);
    let errorMessage = "Failed to fetch commits.";
    const status = typeof error === "object" && error !== null && "status" in error
      ? error.status
      : undefined;
    if (status === 403) errorMessage = "GitHub API Rate limit exceeded. Try again later.";
    if (status === 422) errorMessage = "Validation failed. User might not exist.";
    
    return { found: false, error: errorMessage, commits: [] };
  }
}
