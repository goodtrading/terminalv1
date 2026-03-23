import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAuthToken, setAuthToken } from "@/lib/authToken";

export interface AuthUser {
  id: number;
  email: string;
  role: string;
}

export interface AccessSnapshot {
  allowed: boolean;
  reason?: string;
  subscription?: {
    id: number;
    planId: number;
    planName: string;
    planSlug: string;
    endsAt: string;
    startsAt: string;
  };
}

interface MeResponse {
  user: AuthUser | null;
  access: AccessSnapshot | null;
  saasDisabled?: boolean;
}

interface TerminalAuthContextValue {
  saasDisabled: boolean;
  authReady: boolean;
  user: AuthUser | null;
  access: AccessSnapshot | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const TerminalAuthContext = createContext<TerminalAuthContextValue | null>(null);

async function fetchMe(): Promise<MeResponse> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/auth/me", { credentials: "include", headers });
  if (!res.ok) {
    throw new Error(`me:${res.status}`);
  }
  return res.json() as Promise<MeResponse>;
}

export function TerminalAuthProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [access, setAccess] = useState<AccessSnapshot | null>(null);
  const [saasDisabled, setSaasDisabled] = useState(false);
  const [token, setTokenState] = useState<string | null>(() => getAuthToken());

  const applyToken = useCallback((t: string | null) => {
    setAuthToken(t);
    setTokenState(t);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const me = await fetchMe();
      if (me.saasDisabled) {
        setSaasDisabled(true);
        setUser(null);
        setAccess(null);
        return;
      }
      setSaasDisabled(false);
      setUser(me.user);
      setAccess(me.access);
    } catch {
      setSaasDisabled(false);
      setUser(null);
      setAccess(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        if (me.saasDisabled) {
          setSaasDisabled(true);
          setUser(null);
          setAccess(null);
        } else {
          setSaasDisabled(false);
          setUser(me.user);
          setAccess(me.access);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setAccess(null);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onToken = () => {
      setTokenState(getAuthToken());
      void refreshSession();
    };
    window.addEventListener("gt-auth-token-change", onToken);
    return () => window.removeEventListener("gt-auth-token-change", onToken);
  }, [refreshSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "LOGIN_FAILED");
      }
      const t = (data as { token?: string }).token;
      if (t) applyToken(t);
      setUser((data as { user: AuthUser }).user);
      setAccess((data as { access: AccessSnapshot }).access);
    },
    [applyToken],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "REGISTER_FAILED");
      }
      const t = (data as { token?: string }).token;
      if (t) applyToken(t);
      setUser((data as { user: AuthUser }).user);
      setAccess((data as { access: AccessSnapshot }).access);
    },
    [applyToken],
  );

  const logout = useCallback(() => {
    applyToken(null);
    setUser(null);
    setAccess(null);
  }, [applyToken]);

  const value = useMemo(
    () => ({
      saasDisabled,
      authReady,
      user,
      access,
      token,
      login,
      register,
      logout,
      refreshSession,
    }),
    [saasDisabled, authReady, user, access, token, login, register, logout, refreshSession],
  );

  return (
    <TerminalAuthContext.Provider value={value}>{children}</TerminalAuthContext.Provider>
  );
}

export function useTerminalAuth(): TerminalAuthContextValue {
  const ctx = useContext(TerminalAuthContext);
  if (!ctx) {
    throw new Error("useTerminalAuth must be used within TerminalAuthProvider");
  }
  return ctx;
}
