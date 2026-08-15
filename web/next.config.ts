import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Flutter/Django clients use trailing slashes
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
