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

const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https://github.com https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "connect-src 'self' https://vitals.vercel-insights.com https://*.vercel-insights.com",
].join("; ");

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
  {
    key: "Content-Security-Policy-Report-Only",
    value: contentSecurityPolicyReportOnly,
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
