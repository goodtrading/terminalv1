import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  BingxLoginStatusResponse,
  BingXConnectResponse,
  BrokerSessionState,
} from "./executionTypes";
import {
  clearBrokerSession,
  DEFAULT_BROKER_SESSION,
  loadBrokerSession,
  saveBrokerSession,
} from "./brokerSessionState";

type BrokerSessionContextValue = {
  session: BrokerSessionState;
  loginStatus: BingxLoginStatusResponse | null;
  loginStatusLoading: boolean;
  connectBingX: () => Promise<void>;
  connectSecureApi: (input: {
    apiKey: string;
    apiSecret: string;
    label?: string;
    save: boolean;
    requestedTrading: boolean;
  }) => Promise<BingXConnectResponse>;
  simulateBingXDemoConnection: () => Promise<void>;
  disconnectBroker: (options?: { deleteStored?: boolean }) => Promise<void>;
  connectPaperTrading: () => void;
  disconnectPaperTrading: () => void;
  refreshBrokerStatus: () => Promise<void>;
};

const BrokerSessionContext = createContext<BrokerSessionContextValue | null>(null);

function applySession(next: BrokerSessionState) {
  saveBrokerSession(next);
  return next;
}

export function BrokerSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BrokerSessionState>(() => loadBrokerSession());
  const [loginStatus, setLoginStatus] = useState<BingxLoginStatusResponse | null>(null);
  const [loginStatusLoading, setLoginStatusLoading] = useState(false);

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
        if (prev.connectionMode === "secure_api" && prev.connected) {
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
    }
  }, []);

  const connectSecureApi = useCallback(
    async (input: {
      apiKey: string;
      apiSecret: string;
      label?: string;
      save: boolean;
      requestedTrading: boolean;
    }): Promise<BingXConnectResponse> => {
      setSession((prev) =>
        applySession({
          ...prev,
          exchange: "bingx",
          phase: "checking",
          connected: false,
          demo: false,
          connectionMode: "secure_api",
          message: "Testing BingX API connection…",
          lastError: undefined,
        }),
      );

      try {
        const res = await fetch("/api/bingx/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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

        const data = (await res.json()) as BingXConnectResponse;
        if (!res.ok || !data.success || !data.connection) {
          const message = data.message ?? "BingX API connection failed";
          setSession((prev) =>
            applySession({
              ...prev,
              exchange: "bingx",
              phase: "error",
              connected: false,
              demo: false,
              connectionMode: "secure_api",
              lastError: message,
              message,
            }),
          );
          return { success: false, message, code: data.code };
        }

        const conn = data.connection;
        const persisted =
          input.save && conn.id && conn.id !== "session-only" && conn.id !== "ephemeral";

        setSession((prev) =>
          applySession({
            ...prev,
            exchange: "bingx",
            phase: "connected",
            connected: true,
            demo: false,
            connectionMode: "secure_api",
            connectionId: persisted ? conn.id : undefined,
            apiKeyMasked: conn.apiKeyMasked,
            readOnly: true,
            tradingEnabled: false,
            connectedAt: new Date().toISOString(),
            message:
              data.warning ??
              "BingX connected in read-only mode. Live trading remains disabled.",
            lastError: undefined,
          }),
        );

        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Connection failed";
        setSession((prev) =>
          applySession({
            ...prev,
            exchange: "bingx",
            phase: "error",
            connected: false,
            connectionMode: "secure_api",
            lastError: message,
            message,
          }),
        );
        return { success: false, message };
      }
    },
    [],
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
    setSession((prev) =>
      applySession({
        ...prev,
        exchange: "paper",
        phase: "connected",
        connected: true,
        demo: false,
        connectionMode: "paper",
        readOnly: false,
        tradingEnabled: false,
        connectionId: undefined,
        apiKeyMasked: undefined,
        message: "GoodTrading Paper Trading connected.",
        connectedAt: new Date().toISOString(),
        lastError: undefined,
      }),
    );
  }, []);

  const disconnectPaperTrading = useCallback(() => {
    clearBrokerSession();
    setSession({ ...DEFAULT_BROKER_SESSION });
  }, []);

  const disconnectBroker = useCallback(
    async (options?: { deleteStored?: boolean }) => {
      const id = session.connectionId;
      if (options?.deleteStored && id && id !== "session-only" && id !== "ephemeral") {
        try {
          await fetch(`/api/bingx/connections/${encodeURIComponent(id)}`, {
            method: "DELETE",
          });
        } catch {
          // still clear local session
        }
      }
      clearBrokerSession();
      setSession({ ...DEFAULT_BROKER_SESSION });
    },
    [session.connectionId],
  );

  const value = useMemo(
    () => ({
      session,
      loginStatus,
      loginStatusLoading,
      connectBingX,
      connectSecureApi,
      simulateBingXDemoConnection,
      disconnectBroker,
      connectPaperTrading,
      disconnectPaperTrading,
      refreshBrokerStatus,
    }),
    [
      session,
      loginStatus,
      loginStatusLoading,
      connectBingX,
      connectSecureApi,
      simulateBingXDemoConnection,
      disconnectBroker,
      connectPaperTrading,
      disconnectPaperTrading,
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
