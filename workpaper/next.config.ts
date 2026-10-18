import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never ship local visitor history, audit logs, or the development signing key.
  outputFileTracingExcludes: {
    "**": ["./.data/**/*"],
  },
};

export default nextConfig;
