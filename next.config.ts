import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inlined at build time so /api/version can report which commit is live.
  // Netlify provides COMMIT_REF; GitHub Actions provides GITHUB_SHA.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.COMMIT_REF || process.env.GITHUB_SHA || process.env.WORKERS_CI_COMMIT_SHA || 'dev',
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
