import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const SessionContext = createContext(null);

/** Session utilisateur (JWT) + configuration blockchain exposée par le backend. */
export function SessionProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState(null);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    (async () => {
      try {
        setAppConfig(await api('/config'));
      } catch (err) {
        setConfigError(`API injoignable : ${err.message}`);
      }
      if (getToken()) {
        try {
          setUser((await api('/auth/me')).user);
        } catch {
          setToken(null);
        }
      }
      setLoading(false);
    })();
  }, [logout]);

  const login = useCallback(async (email, password) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password } });
    queryClient.clear();
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, appConfig, loading, configError, login, logout }),
    [user, appConfig, loading, configError, login, logout],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
