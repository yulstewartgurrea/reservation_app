/**
 * Turn an Axios/fetch error into a user-friendly string.
 *
 * DRF returns:
 *   - { detail: "..." }                              for 400/401/403/404 single messages
 *   - { field_a: ["msg1"], field_b: ["msg2"] }       for validation errors
 *   - { non_field_errors: ["..."] }                  occasionally
 *
 * Anything we can't parse falls back to the HTTP status text or a generic message.
 */
export function formatApiError(err: unknown, fallback = "Something went wrong."): string {
  // axios errors expose `response.data`
  const data = (err as any)?.response?.data;

  if (typeof data === "string" && data) return data;

  if (data && typeof data === "object") {
    if (typeof data.detail === "string") return data.detail;

    const parts: string[] = [];
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        parts.push(`${key === "non_field_errors" ? "" : key + ": "}${value.join(", ")}`);
      } else if (typeof value === "string") {
        parts.push(`${key}: ${value}`);
      }
    }
    if (parts.length) return parts.join(" • ");
  }

  if ((err as any)?.message) return (err as any).message;
  return fallback;
}
