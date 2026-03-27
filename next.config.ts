import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["proart.home.arpa"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
      {
        protocol: "https",
        hostname: "yt3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
      {
        protocol: "https",
        hostname: "grove-media.pof4.com",
      },
    ],
  },
};

export default nextConfig;
