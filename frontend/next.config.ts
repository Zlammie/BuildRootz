import type { NextConfig } from "next";

const uploadBase =
  (process.env.BUILDROOTZ_UPLOAD_BASE_URL ||
    process.env.BUILDROOTZ_ASSET_BASE ||
    process.env.ASSET_BASE ||
    "").replace(/\/$/, "");

const nextConfig: NextConfig = {
  experimental: {
    externalDir: true,
  },
  async rewrites() {
    if (!uploadBase) {
      return [];
    }
    return [
      {
        source: "/uploads/:path*",
        destination: `${uploadBase}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;
