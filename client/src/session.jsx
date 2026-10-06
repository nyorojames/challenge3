import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokenStore } from './api/client.js';

const SessionContext = createContext(null);
const SHOP_KEY = 'duka.session';

// The logged-in user and shop are cached in localStorage so a page refresh
// (or, later, opening the app offline) does not log the shopkeeper out.
function readCachedSession() {
  try {
    return tokenStore.get() ? JSON.parse(localStorage.getItem(SHOP_KEY)) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(readCachedSession); // { user, shop } or null

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(SHOP_KEY);
    setSession(null);
  }, []);

  const login = async (phone, password) => {
    const { token, user, shop } = await api('/auth/login', { method: 'POST', body: { phone, password } });
    tokenStore.set(token);
    localStorage.setItem(SHOP_KEY, JSON.stringify({ user, shop }));
    setSession({ user, shop });
  };

  useEffect(() => {
    window.addEventListener('duka:session-expired', logout);
    return () => window.removeEventListener('duka:session-expired', logout);
  }, [logout]);

  return (
    <SessionContext.Provider value={{ ...session, isLoggedIn: Boolean(session), login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
