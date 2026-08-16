import { commitSearchMocksEnabled, type EnvLike } from "@/app/e2eCommitSearchMocks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tells the Playwright preflight whether the server already listening on its port was started for
// this suite. Identity is not enough: `/api/health` proves the port holds this application, and a
// server left behind by an interrupted run passes that while serving no fixtures at all, so every
// reserved `e2e-*` username reaches real GitHub and the whole suite fails for the wrong reason.
// Only the server can answer this, since the preflight did not launch it and has no view of how it
// was launched.
//
// Why a separate route rather than a field on `/api/health`:
//
// `/api/health` is public and uncached, and its own comment fixes its ceiling at "GITHUB_TOKEN is
// set" -- an operational fact a production operator needs. A mocks flag is not that; it is test
// configuration, useful to nothing that runs in production. Adding it would be harmless on its own
// merits, since the flag is never set on a deployed server and the field would read `false`
// forever. The cost is the precedent: "always false in production" becomes the accepted reason to
// hang test and harness state off a public endpoint, and the next flag makes the same argument
// while not necessarily being always-false. This route keeps that argument from ever being needed.
//
// It is 404 in any production build (`next build` sets NODE_ENV, so this covers `next start` and
// every Vercel deployment, preview included). On a deployed server the answer is not merely
// uninteresting -- the question cannot be asked. What remains reachable is a development server,
// where the payload is one boolean about that developer's own shell.
type ReadinessPayload = {
  service: "my-first-commit";
  // Nothing else belongs here. This route answers one question for one caller; anything added is
  // handed to whatever can reach a development server.
  commitSearchMocks: boolean;
};

function isProductionBuild() {
  return process.env.NODE_ENV === "production";
}

export function buildReadinessPayload(env: EnvLike = process.env): ReadinessPayload {
  return {
    service: "my-first-commit",
    commitSearchMocks: commitSearchMocksEnabled(env),
  };
}

export async function GET() {
  if (isProductionBuild()) {
    return new Response(null, { status: 404 });
  }

  return Response.json(buildReadinessPayload(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
