const GITHUB_BASE_URL = "https://github.com";

export function githubProfileUrl(username: string) {
  return `${GITHUB_BASE_URL}/${username}`;
}

export function githubRepositoryUrl(fullName: string) {
  return `${GITHUB_BASE_URL}/${fullName}`;
}
