import axios from "axios";

/**
 * In production the app is served from the SAME origin as the API — CloudFront
 * routes `/api/*` and `/ws/*` to the backend — so the base is RELATIVE. No
 * hardcoded host, no CORS, works on every domain it's ever served from
 * (staging.bookme.ph, the raw *.cloudfront.net URL, future prod bookme.ph)
 * with no per-domain rebuild.
 *
 * Local dev points elsewhere: set `NEXT_PUBLIC_API_URL=http://localhost:8000`
 * in `frontend/.env.local`. When that var is set (and non-empty) we use it as
 * an explicit origin; otherwise we fall back to the same-origin relative path.
 */
export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? "")
  .trim()
  .replace(/\/$/, "");

const baseURL = API_ORIGIN ? `${API_ORIGIN}/api` : "/api";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
    return Promise.reject(error);
  }
);
