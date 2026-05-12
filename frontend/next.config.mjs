/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export — emits `out/` for S3 + CloudFront hosting. Only affects `next build`;
  // `next dev` is unchanged. App must avoid: API routes, middleware, server actions, ISR.
  output: "export",
  // next/image's default loader needs a Node runtime — disable it for static export.
  images: { unoptimized: true },
};

export default nextConfig;
