import ServicesRouteClient from "./_client";

// Static export requires generateStaticParams on every page under a dynamic segment.
// Returning [] means "don't pre-render specific IDs" — runtime SPA fallback handles it.
export async function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <ServicesRouteClient />;
}
