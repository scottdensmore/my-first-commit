export const dynamic = "force-dynamic";
export const revalidate = 0;

type HealthPayload = {
  status: "ok";
  service: "my-first-commit";
  timestamp: string;
  environment: string;
  commit: string;
  checks: {
    siteUrl: {
      configured: boolean;
      value: string | null;
    };
    // Deliberately has no `value`, unlike siteUrl. NEXT_PUBLIC_SITE_URL is public by definition,
    // but GITHUB_TOKEN is a server-side secret, so only its presence is reported. Do not add the
    // value, a prefix, a length, or a hash here: this endpoint is public and uncached.
    githubToken: {
      configured: boolean;
    };
  };
};

function getPublicSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || null;
}

function hasGitHubToken() {
  return Boolean(process.env.GITHUB_TOKEN?.trim());
}

function getShortCommit() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();

  return commit ? commit.slice(0, 7) : "local";
}

export function buildHealthPayload(now = new Date()): HealthPayload {
  const siteUrl = getPublicSiteUrl();

  return {
    status: "ok",
    service: "my-first-commit",
    timestamp: now.toISOString(),
    environment: process.env.VERCEL_ENV?.trim() || "local",
    commit: getShortCommit(),
    checks: {
      siteUrl: {
        configured: Boolean(siteUrl),
        value: siteUrl,
      },
      githubToken: {
        configured: hasGitHubToken(),
      },
    },
  };
}

export async function GET() {
  return Response.json(buildHealthPayload(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
