import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api\/v1\/?$/, '')
  : 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for the Docker runtime image.
  // Without this, `next start` needs the full node_modules at runtime.
  output: "standalone",
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
