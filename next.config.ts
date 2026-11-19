import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inlined at build time so /api/version can report which commit is live.
  // Netlify provides COMMIT_REF, Workers Builds WORKERS_CI_COMMIT_SHA,
  // GitHub Actions GITHUB_SHA.
  env: {
    NEXT_PUBLIC_COMMIT_SHA:
      process.env.COMMIT_REF || process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || 'dev',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
};

export default nextConfig;
