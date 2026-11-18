import { useState, useEffect, useCallback } from 'react';
import { api, ensureCsrf } from '../api/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await ensureCsrf();
      const res = await api.get('/auth/me');
      setUser(res.ok ? res.data?.user : null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { user, loading, refresh };
}
