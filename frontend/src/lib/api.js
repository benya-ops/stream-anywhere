import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sa_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Self-heal stale/invalid tokens: on 401 for a non-auth call, drop the token and
// bounce to the login screen instead of silently spamming 401s.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err.config?.url || "";
    const isAuthCall = url.includes("/auth/login") || url.includes("/auth/me");
    if (err.response?.status === 401 && !isAuthCall && localStorage.getItem("sa_token")) {
      localStorage.removeItem("sa_token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
