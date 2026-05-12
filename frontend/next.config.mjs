import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

/** @type {(phase: string) => import('next').NextConfig} */
export default function config(phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    reactStrictMode: true,
    // Static export — emits `out/` for S3 + CloudFront hosting. Skipped in dev so
    // `generateStaticParams` doesn't reject runtime IDs like /shops/1.
    // App must avoid: API routes, middleware, server actions, ISR.
    ...(isDev ? {} : { output: "export" }),
    // next/image's default loader needs a Node runtime — disable for static export.
    images: { unoptimized: true },
  };
}
