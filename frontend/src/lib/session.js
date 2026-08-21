import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const SessionCtx = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null); // { role, user }
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem("ea_token");
    if (!token) { setSession(null); setReady(true); return; }
    try {
      const { data } = await api.get("/auth/me");
      setSession(data);
    } catch {
      localStorage.removeItem("ea_token");
      setSession(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setToken = (token, role, user) => {
    localStorage.setItem("ea_token", token);
    setSession({ role, user });
  };

  const logout = () => {
    localStorage.removeItem("ea_token");
    setSession(null);
  };

  return (
    <SessionCtx.Provider value={{ session, ready, setToken, logout, refresh }}>
      {children}
    </SessionCtx.Provider>
  );
}

export const useSession = () => useContext(SessionCtx);
