import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native modules from webpack bundling
  serverExternalPackages: ['better-sqlite3'],
};

export default nextConfig;
