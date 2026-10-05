// Every request to our Express API goes through here: adds the login token,
// turns error responses into thrown ApiErrors, and signals an expired session.
// A network failure becomes ApiError with status 0 ("offline").
import { setApiReachable } from '../sync/connectivity.js';

const TOKEN_KEY = 'duka.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only throws when no answer came back at all: no network or server down.
    setApiReachable(false);
    throw new ApiError(0, 'Hakuna mtandao / No connection');
  }
  const data = await response.json().catch(() => null);
  // Our API always answers in JSON. A 5xx WITHOUT JSON comes from the Vite proxy
  // when the Express server is not running: treat that as offline too.
  if (response.status >= 500 && data === null) {
    setApiReachable(false);
    throw new ApiError(0, 'Hakuna mtandao / No connection');
  }
  setApiReachable(true);

  if (!response.ok) {
    // SessionProvider listens for this and sends the user back to login.
    if (response.status === 401 && token) window.dispatchEvent(new Event('duka:session-expired'));
    const detail = data?.details?.map((d) => d.message).join(', ');
    throw new ApiError(response.status, detail || data?.error || `Request failed (${response.status})`, data?.details);
  }
  return data;
}
