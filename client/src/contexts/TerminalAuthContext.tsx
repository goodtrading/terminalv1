import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAuthToken, setAuthToken, clearAuthStorage } from "@/lib/authToken";

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
  if (res.status === 401) {
    throw new Error("me:401");
  }
  if (!res.ok) {
    throw new Error(`me:${res.status}`);
  }
  return res.json() as Promise<MeResponse>;
}

/**
 * If the server does not confirm a user but we still hold a token in localStorage, that copy is stale.
 * Does not affect httpOnly cookie — server remains authoritative via /api/auth/me.
 */
function reconcileTokenWithServerResponse(me: MeResponse): void {
  const hadToken = Boolean(getAuthToken());
  if (!me.user && hadToken) {
    clearAuthStorage();
  }
}

export function TerminalAuthProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [access, setAccess] = useState<AccessSnapshot | null>(null);
  const [saasDisabled, setSaasDisabled] = useState(false);
  const [token, setTokenState] = useState<string | null>(() => getAuthToken());
  /** Bumps on login/register/logout so late /api/auth/me responses cannot overwrite a newer session. */
  const sessionGenerationRef = useRef(0);

  const applyToken = useCallback((t: string | null) => {
    setAuthToken(t);
    setTokenState(getAuthToken());
  }, []);

  const invalidateSession = useCallback(() => {
    sessionGenerationRef.current += 1;
    clearAuthStorage();
    setTokenState(null);
    setUser(null);
    setAccess(null);
  }, []);

  const applyMeResponse = useCallback((me: MeResponse) => {
    reconcileTokenWithServerResponse(me);
    setTokenState(getAuthToken());
    if (me.saasDisabled) {
      setSaasDisabled(true);
      setUser(null);
      setAccess(null);
      return;
    }
    setSaasDisabled(false);
    setUser(me.user);
    setAccess(me.access);
  }, []);

  const refreshSession = useCallback(async () => {
    const genAtStart = sessionGenerationRef.current;
    try {
      const me = await fetchMe();
      if (genAtStart !== sessionGenerationRef.current) return;
      applyMeResponse(me);
    } catch (e) {
      if (genAtStart !== sessionGenerationRef.current) return;
      const msg = e instanceof Error ? e.message : "";
      if (msg === "me:401") {
        invalidateSession();
        return;
      }
      setUser(null);
      setAccess(null);
      setTokenState(getAuthToken());
    }
  }, [applyMeResponse, invalidateSession]);

  useEffect(() => {
    let cancelled = false;
    const genAtStart = sessionGenerationRef.current;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled || genAtStart !== sessionGenerationRef.current) return;
        reconcileTokenWithServerResponse(me);
        if (me.saasDisabled) {
          setSaasDisabled(true);
          setUser(null);
          setAccess(null);
        } else {
          setSaasDisabled(false);
          setUser(me.user);
          setAccess(me.access);
        }
        setTokenState(getAuthToken());
      } catch (e) {
        if (cancelled || genAtStart !== sessionGenerationRef.current) return;
        const msg = e instanceof Error ? e.message : "";
        if (msg === "me:401") {
          invalidateSession();
        } else {
          setUser(null);
          setAccess(null);
          setTokenState(getAuthToken());
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [invalidateSession]);

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
      const u = (data as { user?: AuthUser }).user;
      if (!t || !u) {
        invalidateSession();
        throw new Error("LOGIN_INCOMPLETE");
      }
      sessionGenerationRef.current += 1;
      applyToken(t);
      setUser(u);
      setAccess((data as { access: AccessSnapshot }).access);
    },
    [applyToken, invalidateSession],
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
      const u = (data as { user?: AuthUser }).user;
      if (!t || !u) {
        invalidateSession();
        throw new Error("REGISTER_INCOMPLETE");
      }
      sessionGenerationRef.current += 1;
      applyToken(t);
      setUser(u);
      setAccess((data as { access: AccessSnapshot }).access);
    },
    [applyToken, invalidateSession],
  );

  const logout = useCallback(() => {
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
      invalidateSession();
    });
  }, [invalidateSession]);

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
