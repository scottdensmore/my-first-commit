export function normalizeGitHubUsername(value: string) {
  return value.trim();
}

export function getUsernameValidationMessage(value: string) {
  const username = normalizeGitHubUsername(value);

  if (!username) return "";
  if (username.length > 39) return "GitHub usernames must be 39 characters or fewer.";
  if (!/^[a-zA-Z0-9-]+$/.test(username)) return "Use only letters, numbers, and hyphens.";
  if (username.startsWith("-") || username.endsWith("-")) return "GitHub usernames cannot start or end with a hyphen.";
  if (username.includes("--")) return "GitHub usernames cannot include consecutive hyphens.";

  return "";
}

