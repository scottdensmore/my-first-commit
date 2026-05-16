import type { NextConfig } from "next";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

const commitSha = process.env.NEXT_PUBLIC_APP_COMMIT_SHA
  ?? process.env.VERCEL_GIT_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? "";
const shortCommitSha = commitSha.slice(0, 7);
const appRelease = process.env.NEXT_PUBLIC_APP_RELEASE
  ?? (shortCommitSha ? `v${packageJson.version}-${shortCommitSha}` : `v${packageJson.version}-local`);
const isProductionDeployment = process.env.VERCEL_ENV === "production";
const appReleaseUrl = process.env.NEXT_PUBLIC_APP_RELEASE_URL
  ?? (shortCommitSha && isProductionDeployment ? `https://github.com/scottdensmore/my-first-commit/releases/tag/${appRelease}` : "");

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
];

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_RELEASE: appRelease,
    NEXT_PUBLIC_APP_RELEASE_URL: appReleaseUrl,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "github.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
