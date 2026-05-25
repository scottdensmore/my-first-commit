import type { CommitData } from "../commitTypes";

export function updateSharedSearchUrl(username: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("user", username);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function clearSharedSearchUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("user");
  const search = url.searchParams.toString();
  window.history.replaceState(
    null,
    "",
    `${url.pathname}${search ? `?${search}` : ""}${url.hash}`,
  );
}

export function getInitialSharedUsername() {
  if (typeof window === "undefined") return "";

  return new URLSearchParams(window.location.search).get("user") ?? "";
}

export function getRepositoryUrl(fullName: string) {
  return `https://github.com/${fullName}`;
}

export function buildResultShareText(username: string, result: CommitData) {
  const firstCommit = result.commits[0];
  if (!firstCommit) {
    return `${username}'s first public commit search: ${window.location.href}`;
  }

  const firstLine = firstCommit.message.split("\n")[0];

  return [
    `${username}'s first public commit: ${firstLine}`,
    `Repository: ${firstCommit.repository.full_name}`,
    `Commit: ${firstCommit.html_url}`,
    `Search: ${window.location.href}`,
  ].join("\n");
}
