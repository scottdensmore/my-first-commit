'use server'

import { Octokit } from "octokit";

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN 
});

export interface FirstCommitData {
  found: boolean;
  error?: string;
  commit?: {
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
}

export async function getFirstCommit(username: string): Promise<FirstCommitData> {
  if (!username) return { found: false, error: "Username is required" };

  try {
    const response = await octokit.rest.search.commits({
      q: `author:${username}`,
      sort: 'committer-date',
      order: 'asc',
      per_page: 1
    });

    const item = response.data.items[0];

    if (!item) {
      return { found: false, error: "No public commits found for this user (or indexing is delayed)." };
    }

    // search.commits returns a simplified repository object. 
    // We might need to handle cases where author is null (common in search results if not linked to user)
    // But we searched by author:username, so it should be linked.

    return {
      found: true,
      commit: {
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
      }
    };

  } catch (error: any) {
    console.error("Error fetching commit:", error);
    let errorMessage = "Failed to fetch commit.";
    if (error.status === 403) errorMessage = "GitHub API Rate limit exceeded. Try again later.";
    if (error.status === 422) errorMessage = "Validation failed. User might not exist.";
    
    return { found: false, error: errorMessage };
  }
}
