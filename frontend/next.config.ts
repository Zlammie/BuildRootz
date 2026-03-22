import type { NextConfig } from "next";

const publicBase =
  (process.env.BUILDROOTZ_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "").replace(/\/$/, "");
const explicitUploadBase =
  (process.env.BUILDROOTZ_UPLOAD_BASE_URL ||
    process.env.BUILDROOTZ_ASSET_BASE ||
    process.env.ASSET_BASE ||
    "").replace(/\/$/, "");
const keepupBase = (process.env.KEEPUP_PUBLIC_BASE_URL || "").replace(/\/$/, "");
const uploadBase =
  explicitUploadBase || (keepupBase && keepupBase !== publicBase ? keepupBase : "");
const nextDistDir = process.env.NEXT_DIST_DIR?.trim();

const nextConfig: NextConfig = {
  distDir: nextDistDir || ".next",
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
