import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server bundle with only the
  // node_modules it actually traced. Keeps the Cloud Run image small.
  output: "standalone",
  // Image Optimization needs `sharp` in the runtime image; not worth it until
  // the app serves real images.
  images: { unoptimized: true },
};

export default nextConfig;
