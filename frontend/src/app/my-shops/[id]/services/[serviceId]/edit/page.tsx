import ClientPage from "./_client";

// Static export requires generateStaticParams on every page under a dynamic segment.
// Returning [] means "don't pre-render specific IDs" — runtime SPA fallback handles it
// (CloudFront 403/404 → /index.html, then client routes from URL via useParams).
export async function generateStaticParams() {
  return [{ id: "_", serviceId: "_" }];
}

export default function Page() {
  return <ClientPage />;
}
