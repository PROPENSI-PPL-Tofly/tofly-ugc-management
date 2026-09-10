import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits .next/standalone — a self-contained server bundle with only the
  // node_modules it actually traced. Keeps the Cloud Run image small.
  output: "standalone",
  // Without this Next walks up to the repo root (two package.json files, one
  // lockfile each) and nests the bundle at .next/standalone/frontend/, so the
  // Dockerfile's `node server.js` would not find its entry point. Pinning the
  // root here makes the layout identical inside and outside the container.
  outputFileTracingRoot: import.meta.dirname,
  // Image Optimization needs `sharp` in the runtime image; not worth it until
  // the app serves real images.
  images: { unoptimized: true },
};

export default nextConfig;
