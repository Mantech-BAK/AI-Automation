// Base URL of the API. Empty in local development (Vite proxies /api to the
// Node server); in production set VITE_API_URL to the Render service URL,
// e.g. https://mas-api.onrender.com
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${API_URL}${path}`;
}

// fetch() against the API: prefixes the base URL and always sends the session
// cookie (the frontend and API live on different origins in production).
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: 'include' }).then((response) => {
    // The session is gone (expired, or the server restarted): let the app send the user back to the login screen.
    if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('session-expired'));
    return response;
  });
}
