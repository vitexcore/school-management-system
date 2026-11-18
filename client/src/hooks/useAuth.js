import { useState, useEffect, useCallback } from 'react';
import { api, ensureCsrf } from '../api/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await ensureCsrf();
    const res = await api.get('/auth/me');
    setUser(res.ok ? res.data.user : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    refresh().then(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [refresh]);

  return { user, loading, refresh };
}
