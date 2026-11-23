import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Inlined at build time so /api/version can report which commit is live.
  // Netlify provides COMMIT_REF, Workers Builds WORKERS_CI_COMMIT_SHA,
  // GitHub Actions GITHUB_SHA.
  env: {
    NEXT_PUBLIC_COMMIT_SHA:
      process.env.COMMIT_REF || process.env.WORKERS_CI_COMMIT_SHA || process.env.GITHUB_SHA || 'dev',
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
        ],
      },
    ];
  },
};

export default nextConfig;
