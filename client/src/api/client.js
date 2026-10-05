// Every request to our Express API goes through here: adds the login token,
// turns error responses into thrown ApiErrors, and signals an expired session.

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
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // SessionProvider listens for this and sends the user back to login.
    if (response.status === 401 && token) window.dispatchEvent(new Event('duka:session-expired'));
    const detail = data?.details?.map((d) => d.message).join(', ');
    throw new ApiError(response.status, detail || data?.error || `Request failed (${response.status})`, data?.details);
  }
  return data;
}
