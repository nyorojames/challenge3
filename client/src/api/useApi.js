import { useCallback, useEffect, useState } from 'react';
import { api } from './client.js';
import { db } from '../db/index.js';
import { isOnline, onConnectivityChange } from '../sync/connectivity.js';

/**
 * Loads data from a GET endpoint.
 *   const { data, error, loading, stale, reload } = useApi('/customers');
 * Online: fetches, and keeps a copy in IndexedDB.
 * Offline (or the fetch fails for lack of network): shows that last copy, with stale = true.
 * Reloads by itself when we come back online and after an offline sync.
 * Pass null as the path to skip loading.
 */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path), stale: false });

  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    const showCachedCopy = async (fallbackError) => {
      const cached = await db.cache.get(path).catch(() => null);
      if (cached) setState({ data: cached.data, error: null, loading: false, stale: true });
      else setState((s) => ({ ...s, error: fallbackError, loading: false }));
    };

    if (!isOnline()) return showCachedCopy(Object.assign(new Error('Offline: no saved copy of this page yet'), { status: 0 }));
    try {
      const data = await api(path);
      setState({ data, error: null, loading: false, stale: false });
      db.cache.put({ path, data, savedAt: new Date().toISOString() }).catch(() => {});
    } catch (error) {
      if (error.status === 0) await showCachedCopy(error);
      else setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    load();
    const stopWatching = onConnectivityChange(() => isOnline() && load());
    window.addEventListener('duka:synced', load);
    return () => {
      stopWatching();
      window.removeEventListener('duka:synced', load);
    };
  }, [load]);

  return { ...state, reload: load };
}
