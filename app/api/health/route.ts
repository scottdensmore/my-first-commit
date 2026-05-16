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
  };
};

function getPublicSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || null;
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
