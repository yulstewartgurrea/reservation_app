import StationsClient from "./_client";

// Static export requires generateStaticParams on every page under a dynamic segment.
// Returning a placeholder means "don't pre-render specific IDs" — the runtime SPA
// fallback handles real IDs from the URL via useParams.
export async function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <StationsClient />;
}
