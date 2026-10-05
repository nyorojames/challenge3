import { useCallback, useEffect, useState } from 'react';
import { api } from './client.js';

/**
 * Loads data from a GET endpoint.
 *   const { data, error, loading, reload } = useApi('/customers');
 * Pass null as the path to skip loading.
 */
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });

  const load = useCallback(async () => {
    if (!path) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [path]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
