import ClientPage from "./_client";

// Static export requires generateStaticParams on every page under a dynamic segment.
// Returning a placeholder is enough — the client component reads the real id
// from `window.location.pathname` via `useUrlParams` at runtime.
export async function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return <ClientPage />;
}
