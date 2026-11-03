import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import axios from "axios";
import { api } from "@/services/api";
import type { User } from "@/types/api";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SESSION_REQUEST_TIMEOUT_MS = 10_000;
const SESSION_RETRY_DELAYS_MS = [500, 1_000] as const;

const AuthContext = createContext<AuthContextValue | null>(null);

function shouldRetrySession(error: unknown) {
  if (!axios.isAxiosError(error)) return false;
  const apiCode = error.response?.data?.error?.code;
  if (apiCode === "DATABASE_UNAVAILABLE" || apiCode === "DATABASE_QUERY_TIMEOUT") return false;
  return !error.response || error.response.status >= 500;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const { data } = await api.get<{ data: { user: User } }>("/auth/session", {
            timeout: SESSION_REQUEST_TIMEOUT_MS,
          });
          setUser(data.data.user);
          setError(null);
          return;
        } catch (requestError) {
          if (axios.isAxiosError(requestError) && requestError.response?.status === 401) {
            setUser(null);
            setError(null);
            return;
          }
          const retryDelay = SESSION_RETRY_DELAYS_MS[attempt];
          if (retryDelay !== undefined && shouldRetrySession(requestError)) {
            await wait(retryDelay);
            continue;
          }
          if (axios.isAxiosError(requestError) && requestError.code === "ECONNABORTED") {
            setError("The LearnGate API did not answer the session check in time. Check the server terminal, then try again.");
          } else {
            setError(axios.isAxiosError(requestError)
              ? requestError.message
              : "Unable to load your session.");
          }
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    await api.post("/auth/login", { identifier, password });
    try {
      const { data } = await api.get<{ data: { user: User } }>("/auth/session", {
        timeout: SESSION_REQUEST_TIMEOUT_MS,
      });
      setUser(data.data.user);
    } catch (requestError) {
      setUser(null);
      if (axios.isAxiosError(requestError) && requestError.response?.status === 401) {
        throw new Error("Sign-in succeeded, but the server rejected the session cookie. Please sign in again and check the server is running from this project.");
      }
      throw requestError;
    }
    setError(null);
  }, []);

  const signOut = useCallback(async () => {
    await api.post("/auth/logout");
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, error, signIn, signOut, refresh }), [user, loading, error, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
