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
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import type {
  BingxLoginStatusResponse,
  BingXConnectResponse,
  BingXSavedConnection,
  BrokerSessionState,
} from "./executionTypes";
import { bingxApiFetch } from "./bingxApiClient";
import {
  bingXAuthSessionStatus,
  logBingXAuthDebug,
} from "./bingxAuthDebug";
import {
  bingxConnectErrorForUi,
  bingxReadOnlyErrorMessage,
  isBingXStaleClientAuthMessage,
} from "./bingxReadOnlyMessages";
import { getAuthToken } from "@/lib/authToken";
import { logBingXLoadingState } from "./bingxLoadingDebug";
import {
  clearBrokerSession,
  DEFAULT_BROKER_SESSION,
  isTransientBrokerPhase,
  loadBrokerSession,
  normalizeBrokerSession,
  saveBrokerSession,
} from "./brokerSessionState";

const BINGX_LOADING_WATCHDOG_MS = 10_000;
const BINGX_RESTORE_TIMEOUT_MS = 10_000;

type BrokerSessionContextValue = {
  session: BrokerSessionState;
  savedBingXConnections: BingXSavedConnection[];
  loginStatus: BingxLoginStatusResponse | null;
  loginStatusLoading: boolean;
  restoreLoading: boolean;
  requestInFlight: boolean;
  lastBrokerAction: string;
  connectBingX: () => Promise<void>;
  connectSecureApi: (input: {
    apiKey: string;
    apiSecret: string;
    label?: string;
    save: boolean;
    requestedTrading: boolean;
    /** From modal — same auth snapshot as UI debug (avoids stale closure). */
    callerAuth?: { authReady: boolean; userId: number };
  }) => Promise<BingXConnectResponse>;
  clearBingXSecureApiError: () => void;
  simulateBingXDemoConnection: () => Promise<void>;
  disconnectBroker: (options?: { deleteStored?: boolean }) => Promise<void>;
  connectPaperTrading: () => void;
  disconnectPaperTrading: () => void;
  restoreBingXAfterPaper: () => void;
  refreshBrokerStatus: () => Promise<void>;
};

const BrokerSessionContext = createContext<BrokerSessionContextValue | null>(null);

function applySession(next: BrokerSessionState) {
  saveBrokerSession(next);
  return next;
}

function sessionFromSavedConnection(saved: BingXSavedConnection): BrokerSessionState {
  return {
    exchange: "bingx",
    phase: "connected",
    connected: true,
    demo: false,
    connectionMode: "read-only",
    connectionId: saved.id,
    apiKeyMasked: saved.apiKeyMasked,
    readOnly: true,
    tradingEnabled: false,
    message: "Saved BingX read-only connection found.",
    connectedAt: new Date().toISOString(),
    lastError: undefined,
  };
}

function connectFailureMessage(
  data: BingXConnectResponse & { error?: string },
  status: number,
  clientHasUser: boolean,
): string {
  return bingxConnectErrorForUi(
    data.code ?? (status === 401 ? "UNAUTHORIZED" : undefined),
    data.message ?? (data.error === "UNAUTHORIZED" ? undefined : data.error),
    { clientHasUser },
  );
}

function isAuthConnectFailure(
  data: BingXConnectResponse & { error?: string },
  status: number,
): boolean {
  return (
    status === 401 ||
    data.code === "UNAUTHORIZED" ||
    data.code === "INVALID_TOKEN" ||
    data.error === "UNAUTHORIZED"
  );
}

function releaseTransientSession(
  prev: BrokerSessionState,
  message?: string,
): BrokerSessionState {
  if (!isTransientBrokerPhase(prev.phase)) return prev;
  if (prev.connected) {
    return normalizeBrokerSession({
      ...prev,
      phase: "connected",
      message: message ?? prev.message,
    });
  }
  return normalizeBrokerSession({
    ...prev,
    phase: "error",
    connected: false,
    message: message ?? "Connection timed out. Please retry.",
    lastError: message ?? prev.lastError,
  });
}

export function BrokerSessionProvider({ children }: { children: ReactNode }) {
  const { user, authReady, authenticated } = useTerminalAuth();
  const [session, setSession] = useState<BrokerSessionState>(() =>
    normalizeBrokerSession(loadBrokerSession()),
  );
  const [loginStatus, setLoginStatus] = useState<BingxLoginStatusResponse | null>(null);
  const [loginStatusLoading, setLoginStatusLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [savedConnections, setSavedConnections] = useState<BingXSavedConnection[]>([]);
  const [lastBrokerAction, setLastBrokerAction] = useState("idle");
  const restoreInFlightRef = useRef(false);
  const [connectInFlight, setConnectInFlight] = useState(false);

  const requestInFlight =
    restoreLoading || loginStatusLoading || connectInFlight;

  useEffect(() => {
    logBingXLoadingState({
      apiLoading: connectInFlight,
      restoreLoading,
      loginStatusLoading,
      connectionStatus: session.phase,
      brokerStatus: session.exchange ?? "none",
      authReady,
      hasUser: Boolean(user),
      requestInFlight,
      lastAction: lastBrokerAction,
    });
  }, [
    session.phase,
    session.exchange,
    restoreLoading,
    loginStatusLoading,
    authReady,
    user,
    lastBrokerAction,
    requestInFlight,
    connectInFlight,
  ]);

  useEffect(() => {
    if (!isTransientBrokerPhase(session.phase)) return;
    const timer = window.setTimeout(() => {
      setSession((prev) => {
        if (!isTransientBrokerPhase(prev.phase)) return prev;
        return applySession(
          releaseTransientSession(
            prev,
            "Connection timed out. Please retry.",
          ),
        );
      });
      setLastBrokerAction("watchdog_timeout");
    }, BINGX_LOADING_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [session.phase]);

  const refreshBrokerStatus = useCallback(async () => {
    setLoginStatusLoading(true);
    try {
      const res = await fetch("/api/broker/bingx/login-status");
      if (!res.ok) throw new Error("Failed to load broker login status");
      const data = (await res.json()) as BingxLoginStatusResponse;
      setLoginStatus(data);

      setSession((prev) => {
        if (prev.demo && prev.phase === "connected_demo") {
          return prev;
        }
        if (
          (prev.connectionMode === "secure_api" ||
            prev.connectionMode === "read-only") &&
          prev.connected
        ) {
          return prev;
        }
        if (prev.connectionMode === "paper" && prev.connected) {
          return prev;
        }
        if (!data.liveTradingEnabled && prev.connected && !prev.demo) {
          return applySession({
            ...prev,
            message:
              prev.message ??
              "Broker session pending. Live trading remains disabled.",
          });
        }
        return prev;
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh broker status";
      setSession((prev) =>
        prev.phase === "connected_demo"
          ? prev
          : applySession({
              ...prev,
              phase: "error",
              connected: false,
              lastError: message,
              message,
            }),
      );
    } finally {
      setLoginStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBrokerStatus();
  }, [refreshBrokerStatus]);

  const restoreSavedBingXConnection = useCallback(async () => {
    const status = bingXAuthSessionStatus(authReady, authenticated, user);
    logBingXAuthDebug(status, user?.id != null && Number.isFinite(Number(user.id)));
    if (!authReady || !user) {
      setSavedConnections([]);
      setSession((prev) =>
        isTransientBrokerPhase(prev.phase)
          ? applySession(releaseTransientSession(prev))
          : prev,
      );
      return;
    }
    if (restoreInFlightRef.current) return;

    restoreInFlightRef.current = true;
    setRestoreLoading(true);
    setLastBrokerAction("restore");

    const restoreWork = async () => {
      const res = await bingxApiFetch("/api/bingx/connections", {
        method: "GET",
        assertOk: false,
      });
      const data = (await res.json()) as {
        success?: boolean;
        connections?: BingXSavedConnection[];
      };
      if (!res.ok) {
        throw new Error(`restore:${res.status}`);
      }
      const list = data.connections ?? [];
      setSavedConnections(list);
      const saved =
        list.find((c) => c.status === "connected" && c.connected !== false) ??
        list[0];
      if (!saved?.id) {
        setSession((prev) => {
          if (prev.exchange !== "bingx") return prev;
          if (prev.connected && prev.connectionMode === "read-only") {
            return applySession({
              ...prev,
              phase: "not_connected",
              connected: false,
              connectionMode: null,
              connectionId: undefined,
              message: "No saved BingX connection.",
            });
          }
          return isTransientBrokerPhase(prev.phase)
            ? applySession(releaseTransientSession(prev))
            : prev;
        });
        return;
      }

      setSession((prev) => {
        if (prev.exchange === "paper" && prev.connected) return prev;
        if (
          prev.connectionMode === "read-only" &&
          prev.connected &&
          prev.connectionId === saved.id
        ) {
          return isTransientBrokerPhase(prev.phase)
            ? applySession({ ...prev, phase: "connected" })
            : prev;
        }
        return applySession(sessionFromSavedConnection(saved));
      });
    };

    try {
      await Promise.race([
        restoreWork(),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("RESTORE_TIMEOUT")),
            BINGX_RESTORE_TIMEOUT_MS,
          );
        }),
      ]);
    } catch {
      setSavedConnections([]);
      setSession((prev) =>
        applySession(releaseTransientSession(prev, "Could not restore BingX connection.")),
      );
    } finally {
      restoreInFlightRef.current = false;
      setRestoreLoading(false);
      setLastBrokerAction("restore_done");
    }
  }, [authReady, authenticated, user]);

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setSavedConnections([]);
      setSession((prev) => {
        if (
          prev.connectionMode === "read-only" ||
          prev.connectionMode === "secure_api" ||
          isTransientBrokerPhase(prev.phase)
        ) {
          clearBrokerSession();
          return { ...DEFAULT_BROKER_SESSION };
        }
        return prev;
      });
      return;
    }
    void restoreSavedBingXConnection();
  }, [authReady, user, restoreSavedBingXConnection]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("broker") === "bingx" &&
      params.get("connection") === "callback_received"
    ) {
      setSession((prev) =>
        applySession({
          ...prev,
          exchange: "bingx",
          phase: "connecting",
          connected: false,
          demo: false,
          connectionMode: "broker_login",
          message:
            "Broker login callback received. Awaiting official connection handshake.",
        }),
      );
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  const connectBingX = useCallback(async () => {
    setLastBrokerAction("broker_login");
    setSession((prev) =>
      applySession({
        ...prev,
        exchange: "bingx",
        phase: "checking",
        connected: false,
        demo: false,
        connectionMode: "broker_login",
        message: "Checking BingX broker login availability…",
        lastError: undefined,
      }),
    );

    try {
      const res = await fetch("/api/broker/bingx/login-status");
      if (!res.ok) throw new Error("Broker login status unavailable");
      const data = (await res.json()) as BingxLoginStatusResponse;
      setLoginStatus(data);

      if (!data.brokerLoginAvailable || !data.brokerLoginUrl) {
        setSession((prev) =>
          applySession({
            ...prev,
            exchange: "bingx",
            phase: "broker_login_unavailable",
            connected: false,
            demo: false,
            connectionMode: "broker_login",
            brokerLoginUrl: null,
            message:
              "BingX broker login is prepared but not available yet.",
          }),
        );
        return;
      }

      setSession((prev) =>
        applySession({
          ...prev,
          exchange: "bingx",
          phase: "connecting",
          connected: false,
          demo: false,
          connectionMode: "broker_login",
          brokerLoginUrl: data.brokerLoginUrl,
          message: "Connecting to BingX broker login…",
        }),
      );

      window.open(data.brokerLoginUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setSession((prev) =>
        applySession({
          ...prev,
          exchange: "bingx",
          phase: "error",
          connected: false,
          demo: false,
          lastError: message,
          message,
        }),
      );
    } finally {
      setLastBrokerAction("broker_login_done");
    }
  }, []);

  const clearBingXSecureApiError = useCallback(() => {
    setSession((prev) => {
      if (prev.exchange !== "bingx") return prev;
      const msgStale = isBingXStaleClientAuthMessage(prev.message);
      const errStale = isBingXStaleClientAuthMessage(prev.lastError);
      if (!msgStale && !errStale) return prev;
      return applySession({
        ...prev,
        phase:
          prev.connected && prev.phase === "error" ? "connected" : prev.phase,
        lastError: errStale ? undefined : prev.lastError,
        message: msgStale ? undefined : prev.message,
      });
    });
  }, []);

  const connectSecureApi = useCallback(
    async (input: {
      apiKey: string;
      apiSecret: string;
      label?: string;
      save: boolean;
      requestedTrading: boolean;
      callerAuth?: { authReady: boolean; userId: number };
    }): Promise<BingXConnectResponse> => {
      const ready = input.callerAuth?.authReady ?? authReady;
      const userId = input.callerAuth?.userId ?? user?.id;
      const hasCallerUser =
        userId != null && Number.isFinite(Number(userId));
      const status = bingXAuthSessionStatus(authReady, authenticated, user);
      logBingXAuthDebug(status, hasCallerUser);

      if (!ready) {
        const message = bingxReadOnlyErrorMessage("AUTH_LOADING");
        return { success: false, code: "AUTH_LOADING", message };
      }
      if (!hasCallerUser) {
        const message = bingxReadOnlyErrorMessage("UNAUTHORIZED");
        return { success: false, code: "UNAUTHORIZED", message };
      }

      if (import.meta.env.DEV) {
        console.debug("[BingX Submit Auth]", {
          authReady: ready,
          hasUser: hasCallerUser,
          hasUserId: hasCallerUser,
          hasToken: Boolean(getAuthToken()),
          willPost: true,
        });
      }

      setConnectInFlight(true);
      setLastBrokerAction("secure_api_connect");
      setSession((prev) =>
        applySession({
          ...prev,
          exchange: "bingx",
          phase: "checking",
          connected: false,
          demo: false,
          connectionMode: "read-only",
          message: "Testing BingX API connection…",
          lastError: undefined,
        }),
      );

      try {
        const res = await bingxApiFetch("/api/bingx/connect", {
          method: "POST",
          assertOk: false,
          body: JSON.stringify({
            apiKey: input.apiKey,
            apiSecret: input.apiSecret,
            label: input.label,
            save: input.save,
            requestedPermissions: {
              readOnly: true,
              trading: false,
            },
          }),
        });

        const data = (await res.json()) as BingXConnectResponse & { error?: string };
        if (!res.ok || !data.success || !data.connection) {
          const message = connectFailureMessage(data, res.status, hasCallerUser);
          setSession((prev) =>
            applySession({
              ...prev,
              exchange: "bingx",
              phase: "error",
              connected: false,
              demo: false,
              connectionMode: "read-only",
              lastError: message,
              message,
            }),
          );
          return {
            success: false,
            message,
            code: data.code ?? (res.status === 401 ? "UNAUTHORIZED" : undefined),
          };
        }

        const conn = data.connection;
        const persisted =
          Boolean(data.saved) &&
          conn.id &&
          conn.id !== "session-only" &&
          conn.id !== "ephemeral";

        const successMessage = persisted
          ? (data.message ?? "Credentials saved securely to your account.")
          : (data.warning ??
            "Connected for this session only. Encryption key is missing, so credentials were not saved.");

        setSession((prev) =>
          applySession({
            ...prev,
            exchange: "bingx",
            phase: "connected",
            connected: true,
            demo: false,
            connectionMode: "read-only",
            connectionId: persisted ? conn.id : undefined,
            apiKeyMasked: conn.apiKeyMasked,
            readOnly: true,
            tradingEnabled: false,
            connectedAt: new Date().toISOString(),
            message: successMessage,
            lastError: undefined,
          }),
        );

        if (persisted) {
          void restoreSavedBingXConnection();
        }

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection failed";
        setSession((prev) =>
          applySession({
            ...prev,
            exchange: "bingx",
            phase: "error",
            connected: false,
            connectionMode: "read-only",
            lastError: message,
            message,
          }),
        );
        return { success: false, message };
      } finally {
        setConnectInFlight(false);
        setLastBrokerAction("secure_api_connect_done");
        setSession((prev) => {
          if (!isTransientBrokerPhase(prev.phase) || prev.connected) return prev;
          return applySession(
            releaseTransientSession(prev, prev.lastError ?? "Connection attempt ended."),
          );
        });
      }
    },
    [authReady, authenticated, user, restoreSavedBingXConnection],
  );

  const simulateBingXDemoConnection = useCallback(async () => {
    try {
      const res = await fetch("/api/broker/bingx/login-status");
      if (!res.ok) return;
      const data = (await res.json()) as BingxLoginStatusResponse;
      setLoginStatus(data);
      if (!data.demoAvailable) return;
    } catch {
      return;
    }

    setSession((prev) =>
      applySession({
        ...prev,
        exchange: "bingx",
        phase: "connected_demo",
        connected: true,
        demo: true,
        connectionMode: "demo",
        connectedAt: new Date().toISOString(),
        message:
          "BingX demo broker session connected. Live trading remains disabled.",
        lastError: undefined,
      }),
    );
  }, []);

  const connectPaperTrading = useCallback(() => {
    setSession((prev) => {
      const bingxRef =
        prev.exchange === "bingx" &&
        prev.connectionId &&
        prev.connectionId !== "session-only" &&
        prev.connectionId !== "ephemeral"
          ? prev.connectionId
          : prev.bingxReferenceConnectionId;
      return applySession({
        ...prev,
        exchange: "paper",
        phase: "connected",
        connected: true,
        demo: false,
        connectionMode: "paper",
        readOnly: false,
        tradingEnabled: false,
        bingxReferenceConnectionId: bingxRef,
        connectionId: undefined,
        apiKeyMasked: prev.apiKeyMasked,
        message:
          "Paper Trading on BingX Perpetual (simulated). BingX read-only remains available for reference.",
        connectedAt: new Date().toISOString(),
        lastError: undefined,
      });
    });
  }, []);

  const disconnectPaperTrading = useCallback(() => {
    clearBrokerSession();
    setSession({ ...DEFAULT_BROKER_SESSION });
  }, []);

  const restoreBingXAfterPaper = useCallback(() => {
    const saved = loadBrokerSession();
    const refId = saved.bingxReferenceConnectionId;
    if (refId) {
      void restoreSavedBingXConnection();
      return;
    }
    disconnectPaperTrading();
  }, [restoreSavedBingXConnection, disconnectPaperTrading]);

  const disconnectBroker = useCallback(
    async (options?: { deleteStored?: boolean }) => {
      const id = session.connectionId;
      if (options?.deleteStored && id && id !== "session-only" && id !== "ephemeral") {
        try {
          await bingxApiFetch(`/api/bingx/connections/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
        } catch {
          // still clear local session
        }
      }
      clearBrokerSession();
      setSession({ ...DEFAULT_BROKER_SESSION });
      void restoreSavedBingXConnection();
    },
    [session.connectionId, restoreSavedBingXConnection],
  );

  const value = useMemo(
    () => ({
      session,
      savedBingXConnections: savedConnections,
      loginStatus,
      loginStatusLoading,
      restoreLoading,
      requestInFlight,
      connectInFlight,
      lastBrokerAction,
      connectBingX,
      connectSecureApi,
      clearBingXSecureApiError,
      simulateBingXDemoConnection,
      disconnectBroker,
      connectPaperTrading,
      disconnectPaperTrading,
      restoreBingXAfterPaper,
      refreshBrokerStatus,
    }),
    [
      session,
      savedConnections,
      loginStatus,
      loginStatusLoading,
      restoreLoading,
      requestInFlight,
      connectInFlight,
      lastBrokerAction,
      connectBingX,
      connectSecureApi,
      clearBingXSecureApiError,
      simulateBingXDemoConnection,
      disconnectBroker,
      connectPaperTrading,
      disconnectPaperTrading,
      restoreBingXAfterPaper,
      refreshBrokerStatus,
    ],
  );

  return (
    <BrokerSessionContext.Provider value={value}>
      {children}
    </BrokerSessionContext.Provider>
  );
}

export function useBrokerSession(): BrokerSessionContextValue {
  const ctx = useContext(BrokerSessionContext);
  if (!ctx) {
    throw new Error("useBrokerSession must be used within BrokerSessionProvider");
  }
  return ctx;
}
