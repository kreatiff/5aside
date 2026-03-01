import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // required to send and receive HttpOnly refresh cookies
});

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

// Request interceptor to attach bearer token
api.interceptors.request.use((config) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response interceptor to handle 401 and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/auth/refresh") &&
      !originalRequest.url?.includes("/auth/login")
    ) {
      originalRequest._retry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post<{ accessToken: string }>(
              "/api/auth/refresh",
              {},
              { withCredentials: true }
            )
            .then((res) => res.data.accessToken)
            .catch(() => null)
            .finally(() => {
              refreshPromise = null;
            });
        }

        const newToken = await refreshPromise;
        if (newToken) {
          setAccessToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } else {
          // Refresh failed, user is logged out
          setAccessToken(null);
          // Optional: trigger custom event if we want components to know they were logged out
          window.dispatchEvent(new Event("unauthorized"));
        }
      } catch {
        setAccessToken(null);
      }
    }

    return Promise.reject(error);
  }
);
