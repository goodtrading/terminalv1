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
import { apiRequest } from "@/lib/queryClient";

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

export interface MeResponse {
  authenticated?: boolean;
  user: AuthUser | null;
  access: AccessSnapshot | null;
  saasDisabled?: boolean;
}

interface TerminalAuthContextValue {
  saasDisabled: boolean;
  authReady: boolean;
  /** Server-confirmed session (cookie and/or Bearer). */
  authenticated: boolean;
  user: AuthUser | null;
  access: AccessSnapshot | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const TerminalAuthContext = createContext<TerminalAuthContextValue | null>(null);

function isServerAuthenticated(me: MeResponse): boolean {
  if (me.authenticated === true) return true;
  const id = me.user?.id;
  return id != null && Number.isFinite(Number(id));
}

/** /api/auth/me — cookie + Bearer (same as BingX routes). */
export async function fetchMe(): Promise<MeResponse> {
  const res = await apiRequest("/api/auth/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
    assertOk: false,
  });
  if (res.status === 401 || res.status === 403) {
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
  if (me.authenticated === false && hadToken) {
    clearAuthStorage();
  }
}

export function TerminalAuthProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
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
    setAuthenticated(false);
    setUser(null);
    setAccess(null);
  }, []);

  const applyMeResponse = useCallback((me: MeResponse) => {
    reconcileTokenWithServerResponse(me);
    setTokenState(getAuthToken());
    if (me.saasDisabled) {
      setSaasDisabled(true);
      setAuthenticated(false);
      setUser(null);
      setAccess(null);
      return;
    }
    setSaasDisabled(false);
    const serverAuth = isServerAuthenticated(me);
    if (serverAuth) {
      setAuthenticated(true);
      if (me.user) {
        setUser(me.user);
        setAccess(me.access);
      }
      return;
    }
    if (me.authenticated === false) {
      setAuthenticated(false);
      setUser(null);
      setAccess(null);
    }
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
        applyMeResponse(me);
      } catch (e) {
        if (cancelled || genAtStart !== sessionGenerationRef.current) return;
        const msg = e instanceof Error ? e.message : "";
        if (msg === "me:401") {
          invalidateSession();
        } else {
          setTokenState(getAuthToken());
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyMeResponse, invalidateSession]);

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
      const accessData = (data as { access: AccessSnapshot }).access;
      if (!t || !u) {
        invalidateSession();
        throw new Error("LOGIN_INCOMPLETE");
      }
      sessionGenerationRef.current += 1;
      const gen = sessionGenerationRef.current;
      applyToken(t);
      setAuthenticated(true);
      setUser(u);
      setAccess(accessData);
      setAuthReady(true);
      try {
        const me = await fetchMe();
        if (gen === sessionGenerationRef.current) {
          applyMeResponse(me);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "me:401") invalidateSession();
      }
    },
    [applyToken, applyMeResponse, invalidateSession],
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
      const accessData = (data as { access: AccessSnapshot }).access;
      if (!t || !u) {
        invalidateSession();
        throw new Error("REGISTER_INCOMPLETE");
      }
      sessionGenerationRef.current += 1;
      const gen = sessionGenerationRef.current;
      applyToken(t);
      setAuthenticated(true);
      setUser(u);
      setAccess(accessData);
      setAuthReady(true);
      try {
        const me = await fetchMe();
        if (gen === sessionGenerationRef.current) {
          applyMeResponse(me);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "me:401") invalidateSession();
      }
    },
    [applyToken, applyMeResponse, invalidateSession],
  );

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gt-drawing-persist-flush"));
    }
    invalidateSession();
    void fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  }, [invalidateSession]);

  const value = useMemo(
    () => ({
      saasDisabled,
      authReady,
      authenticated,
      user,
      access,
      token,
      login,
      register,
      logout,
      refreshSession,
    }),
    [
      saasDisabled,
      authReady,
      authenticated,
      user,
      access,
      token,
      login,
      register,
      logout,
      refreshSession,
    ],
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
