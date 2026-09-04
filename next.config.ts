import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Capacitor 네이티브 앱에서는 API는 Render 서버로, UI만 번들로
  async rewrites() {
    return [];
  },
};

export default nextConfig;
