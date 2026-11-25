import { execFileSync } from "node:child_process";
import type { NextConfig } from "next";

/**
 * The commit this build is made from, inlined so /api/version can report it.
 * CI hosts set it in the environment (Workers Builds WORKERS_CI_COMMIT_SHA,
 * Netlify COMMIT_REF, GitHub Actions GITHUB_SHA). A hand-run `npm run cf:deploy`
 * has none of those, which is how production ended up reporting `dev` (#353),
 * so fall back to the checkout's HEAD before giving up.
 */
function buildCommitSha(): string {
  const fromEnv =
    process.env.WORKERS_CI_COMMIT_SHA || process.env.COMMIT_REF || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return sha;
  } catch {
    // No git (e.g. a Docker build context without .git): report `dev`.
  }
  return "dev";
}

const nextConfig: NextConfig = {
  // Inlined at build time so /api/version can report which commit is live.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: buildCommitSha(),
  },
  // Served by Cloudflare Workers (OpenNext) with no Images binding, so skip the
  // /_next/image optimizer; the only remote images are GitHub avatars.
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  // Mirrors the [[headers]] block in netlify.toml so the headers survive the
  // move to Cloudflare Workers.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Netlify added HSTS at its edge; Cloudflare Workers don't, so set it here.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
