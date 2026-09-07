import type { NextConfig } from "next";

// Base path is empty for local dev (`next dev` stays at "/") and set to the
// repo subpath in CI (PAGES_BASE_PATH) so assets resolve under the GitHub
// Pages project URL. Drop this env when moving to a root/custom domain.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export", // emit a fully static site into frontend/out
  basePath,
  assetPrefix: basePath || undefined,
  images: { unoptimized: true }, // Image Optimization API can't run on Pages
  trailingSlash: true, // stable directory-style URLs on static hosting
};

export default nextConfig;
