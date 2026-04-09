import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['192.168.1.89', '192.168.1.78'],
  experimental: {
    serverActions: {
      allowedOrigins: ['192.168.1.89:3000', '192.168.1.78:3000']
    }
  }
};

export default nextConfig;
