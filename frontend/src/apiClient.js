const configuredApi =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV
    ? "http://localhost:10000"
    : typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:10000");

export const API_BASE = configuredApi.replace(/\/api\/?$/, "").replace(/\/$/, "");
const authStorageKey = "transport-break-even-auth-token";

let activeAuthToken = readStoredToken();

export function getStoredAuthToken() {
  return activeAuthToken;
}

export function setApiAuthToken(token) {
  activeAuthToken = token || "";

  try {
    if (activeAuthToken) {
      window.localStorage.setItem(authStorageKey, activeAuthToken);
    } else {
      window.localStorage.removeItem(authStorageKey);
    }
  } catch {
    // Local storage may be unavailable in private or test contexts.
  }
}

export async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (activeAuthToken) {
    headers.Authorization = `Bearer ${activeAuthToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;

    try {
      const payload = await response.json();
      error.code = payload.error?.code;
      error.field = payload.error?.field;
      error.message = payload.error?.message || error.message;
    } catch {
      // Keep the HTTP status message.
    }

    if (response.status === 401) {
      setApiAuthToken("");
      window.dispatchEvent(new Event("transport-auth-expired"));
    }

    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function readStoredToken() {
  try {
    return window.localStorage.getItem(authStorageKey) || "";
  } catch {
    return "";
  }
}
