import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Intercept responses to detect Cloudflare Access session expiry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Cloudflare Access usually returns 401 or 403 when session expires
    // Or it might redirect to login, which causes a CORS error in XHR (error.response will be undefined)
    if (
      error.response?.status === 401 ||
      error.response?.status === 403 ||
      (!error.response && error.code === "ERR_NETWORK") // Likely a CORS redirect during auth expiry
    ) {
      // Dispatch a custom event that the Layout can listen to
      window.dispatchEvent(new CustomEvent("auth-failure"));
    }
    return Promise.reject(error);
  }
);
