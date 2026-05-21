import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, Star } from "lucide-react";
import { EXCHANGE_LOGO_URLS } from "./exchangeLogos";
import { BINGX_REFERRAL_URL } from "./executionMockState";
import type { BrokerConnectionPhase } from "./executionTypes";
import {
  bingxConnectErrorForUi,
  bingxEncryptionMissingUserMessage,
  bingxReadOnlyErrorMessage,
  isBingXStaleClientAuthMessage,
} from "./bingxReadOnlyMessages";
import { bingxApiFetch } from "./bingxApiClient";
import { isBingXReadOnlySession } from "./bingxSession";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { useBrokerSession } from "./useBrokerSession";
import {
  bingXAuthSessionStatus,
  logBingXAuthDebug,
} from "./bingxAuthDebug";
import { logBingXLoadingState } from "./bingxLoadingDebug";
import { BingXAuthDevPanel } from "./BingXAuthDevPanel";

export interface BingXConnectionModalProps {
  open: boolean;
  onClose: () => void;
  referralUrl?: string;
}

function openReferral(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function SecureApiPermissionsWarning() {
  return (
    <div className="rounded border border-amber-500/35 bg-amber-950/40 px-3 py-2.5 space-y-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-amber-400/95">
        API key safety
      </p>
      <ul className="text-[9px] text-amber-200/85 leading-snug space-y-0.5 list-disc pl-3.5">
        <li>Create a BingX API key with read-only permissions first.</li>
        <li>Do NOT enable withdrawal permissions.</li>
        <li>Do NOT enable trading permissions yet.</li>
        <li>Use IP whitelist on BingX if available.</li>
        <li>Trading remains locked in this phase.</li>
      </ul>
    </div>
  );
}

function BrokerLoginPanel({
  phase,
  message,
  demoAvailable,
  isChecking,
  onConnect,
  onDemo,
  onDisconnect,
  onRetry,
  onClose,
  referralUrl,
}: {
  phase: BrokerConnectionPhase;
  message?: string;
  demoAvailable: boolean;
  isChecking: boolean;
  onConnect: () => void;
  onDemo: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
  onClose: () => void;
  referralUrl: string;
}) {
  if (phase === "connecting" || phase === "checking") {
    return (
      <div className="space-y-3 text-center py-2">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-400 mx-auto" />
        <p className="text-[11px] text-slate-300">Connecting to BingX broker login…</p>
        <p className="text-[9px] text-slate-500">
          Complete login in the BingX window. GoodTrading will not mark you connected until
          the official callback is configured.
        </p>
        <button
          type="button"
          disabled
          className="w-full rounded border border-terminal-border py-2 text-[10px] font-bold uppercase text-slate-500 opacity-50"
        >
          Connecting…
        </button>
      </div>
    );
  }

  if (phase === "connected_demo") {
    return (
      <div className="space-y-3">
        <div className="rounded border border-amber-500/40 bg-amber-950/30 px-3 py-2.5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
            Connected in demo mode
          </p>
          <p className="text-[9px] text-amber-200/80">
            Live trading remains disabled. This session is for UI testing only.
          </p>
          <span className="inline-block rounded border border-amber-500/50 px-1.5 py-0.5 text-[8px] font-bold uppercase text-amber-200">
            DEMO · NOT LIVE
          </span>
        </div>
        {message ? (
          <p className="text-[9px] text-slate-500 leading-snug">{message}</p>
        ) : null}
        <button
          type="button"
          onClick={onDisconnect}
          className="w-full rounded border border-terminal-border py-2.5 text-[10px] font-bold uppercase text-slate-300 hover:border-white/25"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (phase === "connected") {
    return (
      <div className="space-y-3">
        <div className="rounded border border-emerald-500/35 bg-emerald-950/25 px-3 py-2.5 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
            Connected to BingX
          </p>
          <p className="text-[9px] text-slate-400">
            Live trading permissions pending. Execution remains locked in this phase.
          </p>
        </div>
        {message ? (
          <p className="text-[9px] text-slate-500 leading-snug">{message}</p>
        ) : null}
        <button
          type="button"
          onClick={onDisconnect}
          className="w-full rounded border border-terminal-border py-2.5 text-[10px] font-bold uppercase text-slate-300 hover:border-white/25"
        >
          Disconnect
        </button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="space-y-3">
        <div className="rounded border border-red-500/35 bg-red-950/25 px-3 py-2 text-[10px] text-red-200/90">
          {message ?? "Connection error. Please try again."}
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded border border-cyan-500/50 bg-cyan-600/20 py-2 text-[10px] font-bold uppercase text-cyan-100"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={() => openReferral(referralUrl)}
          className="w-full rounded border border-terminal-border py-2 text-[10px] font-bold uppercase text-slate-400"
        >
          Open account
        </button>
        <button type="button" onClick={onClose} className="w-full text-[9px] text-slate-600 uppercase">
          Close
        </button>
      </div>
    );
  }

  if (phase === "broker_login_unavailable") {
    return (
      <div className="space-y-3">
        <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[10px] text-amber-200/90 space-y-1.5">
          <p className="font-semibold">BingX broker login is prepared but not available yet.</p>
          <p className="text-[9px] text-amber-200/70 leading-snug">
            GoodTrading needs the official BingX broker login URL to enable account
            connection.
          </p>
        </div>
        <button
          type="button"
          disabled={isChecking}
          onClick={onConnect}
          className="w-full rounded border border-cyan-500/50 bg-cyan-600/20 py-2 text-[10px] font-bold uppercase text-cyan-100 disabled:opacity-50"
        >
          {isChecking ? "Checking…" : "Connect"}
        </button>
        <button
          type="button"
          onClick={() => openReferral(referralUrl)}
          className="w-full flex items-center justify-center gap-2 rounded border border-terminal-border py-2 text-[10px] font-bold uppercase text-slate-400"
        >
          Open account
          <ExternalLink className="h-3 w-3 opacity-60" />
        </button>
        {demoAvailable ? (
          <button
            type="button"
            onClick={onDemo}
            className="w-full rounded border border-amber-500/45 bg-amber-600/15 py-2 text-[10px] font-bold uppercase text-amber-100"
          >
            Use demo connection <span className="text-[8px] opacity-80">DEMO</span>
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="w-full text-[9px] text-slate-600 uppercase">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-slate-400 leading-snug">
        Connect via official BingX broker login. No API keys are required for this flow.
      </p>
      <button
        type="button"
        disabled={isChecking}
        onClick={onConnect}
        className="w-full rounded border border-cyan-500/50 bg-cyan-600/20 py-2.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-600/30 disabled:opacity-50"
      >
        {isChecking ? "Checking…" : "Connect"}
      </button>
      <button
        type="button"
        onClick={() => openReferral(referralUrl)}
        className="w-full flex items-center justify-center gap-2 rounded border border-terminal-border py-2 text-[10px] font-bold uppercase text-slate-400"
      >
        Open account
        <ExternalLink className="h-3 w-3 opacity-60" />
      </button>
      {demoAvailable ? (
        <button
          type="button"
          onClick={onDemo}
          className="w-full rounded border border-amber-500/45 bg-amber-600/15 py-2 text-[10px] font-bold uppercase text-amber-100"
        >
          Use demo connection <span className="text-[8px] opacity-80">DEMO</span>
        </button>
      ) : null}
    </div>
  );
}

function ConnectedReadOnlyPanel({
  session,
  onClose,
  onDisconnect,
}: {
  session: {
    apiKeyMasked?: string;
    connectionId?: string;
    message?: string;
  };
  onClose: () => void;
  onDisconnect: () => void;
}) {
  const accountSync =
    session.connectionId &&
    session.connectionId !== "session-only" &&
    session.connectionId !== "ephemeral"
      ? "Active"
      : "Checking";

  return (
    <div className="space-y-4">
      <div className="rounded border border-emerald-500/35 bg-emerald-950/30 px-3 py-3 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
          BingX connected read-only
        </p>
        <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] text-slate-300">
          <span className="text-slate-500">API</span>
          <span className="font-mono">{session.apiKeyMasked ?? "—"}</span>
          <span className="text-slate-500">Mode</span>
          <span>Read-only</span>
          <span className="text-slate-500">Live trading</span>
          <span className="text-amber-400/90">OFF</span>
          <span className="text-slate-500">Execution</span>
          <span className="text-amber-400/90">Locked</span>
          <span className="text-slate-500">Account sync</span>
          <span>{accountSync}</span>
        </div>
        {session.message ? (
          <p className="text-[9px] text-slate-500 leading-snug pt-1 border-t border-terminal-border/60">
            {session.message}
          </p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded border border-cyan-500/45 bg-cyan-600/20 py-2.5 text-[10px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-600/30"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          className="flex-1 rounded border border-terminal-border py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-300 hover:border-white/25 hover:bg-white/[0.04]"
        >
          Disconnect
        </button>
      </div>
    </div>
  );
}

export function BingXConnectionModal({
  open,
  onClose,
  referralUrl = BINGX_REFERRAL_URL,
}: BingXConnectionModalProps) {
  const { authReady, authenticated, user, token, refreshSession } = useTerminalAuth();
  const {
    session,
    loginStatus,
    connectBingX,
    connectSecureApi,
    clearBingXSecureApiError,
    simulateBingXDemoConnection,
    disconnectBroker,
    restoreLoading,
    connectInFlight,
    loginStatusLoading,
    lastBrokerAction,
  } = useBrokerSession();

  const authStatus = bingXAuthSessionStatus(authReady, authenticated, user);
  const userIdExists = user?.id != null && Number.isFinite(Number(user.id));
  const hasUser = userIdExists;
  const authBlocked = authReady && !hasUser;

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("");
  const [confirmKey, setConfirmKey] = useState(false);
  const [saveConnection, setSaveConnection] = useState(true);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean | null>(null);

  const phase = session.exchange === "bingx" ? session.phase : "not_connected";
  const demoAvailable = loginStatus?.demoAvailable ?? false;
  const apiTabEnabled = loginStatus?.apiConnectionEnabled !== false;
  const isSecureConnected = isBingXReadOnlySession(session);
  const isBrokerOnlyConnected =
    session.connected &&
    session.connectionMode === "broker_login" &&
    (phase === "connected" || phase === "connecting");
  const showBrokerPanel =
    !isSecureConnected &&
    (phase === "connected_demo" ||
      phase === "broker_login_unavailable" ||
      phase === "connecting" ||
      phase === "checking" ||
      phase === "error" ||
      isBrokerOnlyConnected ||
      phase === "not_connected");
  const isChecking =
    apiLoading ||
    connectInFlight ||
    (phase === "checking" || phase === "connecting");

  const hasCredentials = Boolean(apiKey.trim() && apiSecret.trim());
  const saveBlocked =
    saveConnection && encryptionAvailable === false;
  const canSubmit =
    authReady &&
    hasUser &&
    hasCredentials &&
    confirmKey &&
    saveConnection &&
    !saveBlocked &&
    !apiLoading;

  const submitBlockReason = useMemo(() => {
    if (!authReady) return null;
    if (authBlocked) return null;
    if (!hasCredentials) return "API Key and API Secret are required.";
    if (!confirmKey) return "Confirm read-only usage first.";
    if (!saveConnection) return "Enable save encrypted connection to persist credentials.";
    if (saveBlocked) return bingxEncryptionMissingUserMessage();
    if (apiLoading) return "Testing connection…";
    return null;
  }, [
    authReady,
    authBlocked,
    hasCredentials,
    confirmKey,
    saveConnection,
    saveBlocked,
    apiLoading,
  ]);

  useEffect(() => {
    logBingXAuthDebug(authStatus, userIdExists);
  }, [authStatus, userIdExists]);

  useEffect(() => {
    if (!open) return;
    logBingXLoadingState({
      apiLoading,
      restoreLoading,
      loginStatusLoading,
      connectionStatus: phase,
      brokerStatus: session.exchange ?? "none",
      authReady,
      hasUser: hasUser,
      requestInFlight: apiLoading || restoreLoading || connectInFlight,
      lastAction: lastBrokerAction,
    });
  }, [
    open,
    apiLoading,
    restoreLoading,
    connectInFlight,
    loginStatusLoading,
    phase,
    session.exchange,
    authReady,
    hasUser,
    lastBrokerAction,
  ]);

  useEffect(() => {
    if (!open) return;
    if (authReady && hasUser) {
      setApiError((prev) =>
        isBingXStaleClientAuthMessage(prev) ? null : prev,
      );
      clearBingXSecureApiError();
    }
  }, [open, authReady, hasUser, clearBingXSecureApiError]);

  useEffect(() => {
    if (!open) return;
    if (!authReady) return;
    if (token && !authenticated) {
      void refreshSession();
    }
  }, [open, authReady, token, authenticated, refreshSession]);

  useEffect(() => {
    if (!open) return;
    if (!authReady) return;
    if (!authenticated) {
      setEncryptionAvailable(null);
      return;
    }
    let cancelled = false;
    void bingxApiFetch("/api/bingx/connections", { method: "GET", assertOk: false })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.encryptionAvailable === "boolean") {
          setEncryptionAvailable(data.encryptionAvailable);
        }
      })
      .catch(() => {
        if (!cancelled) setEncryptionAvailable(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, authReady, authenticated, user]);

  const clearApiForm = () => {
    setApiKey("");
    setApiSecret("");
    setApiError(null);
    setApiWarning(null);
  };

  const handleTestAndConnect = async () => {
    const apiKeyValue = apiKey.trim();
    const apiSecretValue = apiSecret.trim();
    const labelValue = label.trim();
    const saveValue = saveConnection;
    const confirmValue = confirmKey;

    if (import.meta.env.DEV) {
      console.debug("[BingX Submit]", {
        authReady,
        hasUser: Boolean(user),
        hasUserId: userIdExists,
        hasApiKey: Boolean(apiKeyValue),
        hasApiSecret: Boolean(apiSecretValue),
        confirmKey: confirmValue,
        saveConnection: saveValue,
        encryptionAvailable,
        apiLoading,
        submitBlockReason,
      });
      console.debug("[BingX Submit Auth]", {
        authReady,
        hasUser: Boolean(user),
        hasUserId: userIdExists,
        hasToken: Boolean(token),
        willPost: Boolean(user && authReady),
      });
    }

    setApiError(null);
    setApiWarning(null);

    if (!apiKeyValue || !apiSecretValue) {
      setApiError("API Key and API Secret are required.");
      return;
    }
    if (!confirmValue) {
      setApiError("Confirm read-only usage first.");
      return;
    }
    if (!saveValue) {
      setApiError("Enable save encrypted connection to persist credentials.");
      return;
    }
    if (!authReady) {
      setApiError(bingxReadOnlyErrorMessage("AUTH_LOADING"));
      return;
    }
    if (!user?.id || !Number.isFinite(Number(user.id))) {
      setApiError(bingxReadOnlyErrorMessage("UNAUTHORIZED"));
      return;
    }
    if (encryptionAvailable === false) {
      setApiError(bingxEncryptionMissingUserMessage());
      return;
    }

    setApiLoading(true);

    try {
      const result = await connectSecureApi({
        apiKey: apiKeyValue,
        apiSecret: apiSecretValue,
        label: labelValue || undefined,
        save: saveValue,
        requestedTrading: false,
        callerAuth: { authReady: true, userId: user.id },
      });
      if (!result.success) {
        setApiError(
          bingxConnectErrorForUi(result.code, result.message ?? "Connection failed", {
            clientHasUser: true,
          }),
        );
        return;
      }
      if (result.saved) {
        setApiWarning("Credentials saved securely to your account.");
      } else if (result.warning) {
        setApiWarning(
          result.warning ??
            "Connected for this session only. Encryption key is missing, so credentials were not saved.",
        );
      }
      clearApiForm();
    } finally {
      setApiLoading(false);
    }
  };

  const footerLines = (() => {
    const lines = [
      "Credentials are sent once to the server. API secrets are never stored in the browser or returned to the client.",
    ];
    if (saveConnection && encryptionAvailable === true) {
      lines.push("Saved connections are encrypted server-side.");
    } else if (saveConnection && encryptionAvailable === false) {
      lines.push(bingxEncryptionMissingUserMessage());
    }
    return lines;
  })();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md border-terminal-border bg-[#0d0d0d] text-terminal-text p-0 gap-0 font-mono">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-terminal-border">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-terminal-border/60">
              <img
                src={EXCHANGE_LOGO_URLS.bingx}
                alt="BingX logo"
                className="h-full w-full object-cover object-[center_28%]"
              />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-left text-base font-bold tracking-wide text-white">
                BingX
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-400/90">
                  <Star className="h-3 w-3 fill-amber-400/80" />
                  4.8
                </span>
                <span className="rounded border border-cyan-500/35 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-cyan-300">
                  Partner
                </span>
                {isSecureConnected ? (
                  <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-emerald-300">
                    Read-only
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 py-4">
          {isSecureConnected ? (
            <ConnectedReadOnlyPanel
              session={session}
              onClose={onClose}
              onDisconnect={() => void disconnectBroker({ deleteStored: true })}
            />
          ) : showBrokerPanel && !apiTabEnabled ? (
            <BrokerLoginPanel
              phase={phase}
              message={session.message}
              demoAvailable={demoAvailable}
              isChecking={isChecking}
              onConnect={() => void connectBingX()}
              onDemo={() => void simulateBingXDemoConnection()}
              onDisconnect={() => void disconnectBroker()}
              onRetry={() => void connectBingX()}
              onClose={onClose}
              referralUrl={referralUrl}
            />
          ) : (
            <Tabs defaultValue="broker_login" className="w-full">
              <TabsList
                className={cn(
                  "grid w-full bg-terminal-bg border border-terminal-border h-8",
                  apiTabEnabled ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                <TabsTrigger
                  value="broker_login"
                  className="text-[9px] uppercase tracking-wider data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-100"
                >
                  Broker Login
                </TabsTrigger>
                {apiTabEnabled ? (
                  <TabsTrigger
                    value="secure_api"
                    className="text-[9px] uppercase tracking-wider data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-100"
                  >
                    Secure API
                  </TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="broker_login" className="mt-4">
                <BrokerLoginPanel
                  phase={phase}
                  message={session.message}
                  demoAvailable={demoAvailable}
                  isChecking={isChecking}
                  onConnect={() => void connectBingX()}
                  onDemo={() => void simulateBingXDemoConnection()}
                  onDisconnect={() => void disconnectBroker()}
                  onRetry={() => void connectBingX()}
                  onClose={onClose}
                  referralUrl={referralUrl}
                />
              </TabsContent>

              {apiTabEnabled ? (
              <TabsContent value="secure_api" className="mt-4 space-y-3">
                <p className="text-[9px] text-slate-500 leading-snug">
                  Connect via secure API · Read-only first · Trading locked
                </p>

                {authStatus === "loading" ? (
                  <div className="rounded border border-terminal-border bg-terminal-bg/80 px-2 py-1.5 text-[9px] text-slate-400">
                    Checking session…
                  </div>
                ) : authBlocked ? (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[9px] text-amber-200/90">
                    {bingxReadOnlyErrorMessage("UNAUTHORIZED")}
                  </div>
                ) : null}

                <BingXAuthDevPanel
                  open={open}
                  authReady={authReady}
                  contextAuthenticated={authenticated}
                  userExists={Boolean(user)}
                  userIdExists={userIdExists}
                  tokenExists={Boolean(token ?? undefined)}
                  submitBlockReason={submitBlockReason}
                  apiErrorStaleAuth={
                    Boolean(apiError) && isBingXStaleClientAuthMessage(apiError)
                  }
                />

                <SecureApiPermissionsWarning />

                <div>
                  <label className="text-[8px] uppercase text-slate-500">API Key</label>
                  <input
                    type="text"
                    name="bingx-api-key"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="mt-0.5 w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1.5 text-[10px] text-white"
                  />
                </div>
                <div>
                  <label className="text-[8px] uppercase text-slate-500">API Secret</label>
                  <input
                    type="password"
                    name="bingx-api-secret"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="mt-0.5 w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1.5 text-[10px] text-white"
                  />
                  <p className="mt-1 text-[8px] text-slate-500 leading-snug">
                    Your API secret is sent once to the server, encrypted if saved, and
                    never stored in the browser.
                  </p>
                </div>
                <div>
                  <label className="text-[8px] uppercase text-slate-500">Label (optional)</label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="mt-0.5 w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1.5 text-[10px] text-white"
                  />
                </div>

                <label className="flex items-start gap-2 text-[9px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmKey}
                    onChange={(e) => setConfirmKey(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-cyan-500"
                  />
                  I confirm this key was created on BingX and GoodTrading uses read-only mode first.
                </label>
                <label className="flex items-start gap-2 text-[9px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveConnection}
                    onChange={(e) => setSaveConnection(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-cyan-500"
                  />
                  Save encrypted connection on this server (dev/local)
                </label>
                <div className="opacity-60">
                  <label className="flex items-start gap-2 text-[9px] text-slate-500 cursor-not-allowed">
                    <input
                      type="checkbox"
                      checked={false}
                      disabled
                      readOnly
                      className="mt-0.5 h-3.5 w-3.5 accent-amber-500 opacity-50 cursor-not-allowed"
                    />
                    Request trading permissions (locked in this phase)
                  </label>
                  <p className="mt-1 pl-5 text-[8px] text-slate-600 leading-snug">
                    Trading permissions will be available only after Paper Execution and
                    Risk Guard are complete.
                  </p>
                </div>

                {apiError ? (
                  <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[9px] text-red-200/90">
                    {apiError}
                  </div>
                ) : null}
                {apiWarning ? (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[9px] text-amber-200/90">
                    {apiWarning}
                  </div>
                ) : null}

                {submitBlockReason && authReady && !authBlocked && !apiError ? (
                  <p className="text-[8px] text-slate-500 leading-snug">{submitBlockReason}</p>
                ) : null}

                <button
                  type="button"
                  disabled={!authReady || !canSubmit}
                  title={submitBlockReason ?? (!authReady ? "Checking session…" : undefined)}
                  onClick={() => void handleTestAndConnect()}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 rounded border border-cyan-500/50 bg-cyan-600/20 py-2.5 text-[11px] font-bold uppercase tracking-widest text-cyan-100",
                    "hover:bg-cyan-600/30 disabled:opacity-50 disabled:cursor-not-allowed",
                  )}
                >
                  {apiLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Testing connection…
                    </>
                  ) : (
                    "TEST & CONNECT"
                  )}
                </button>
              </TabsContent>
              ) : null}
            </Tabs>
          )}

          {!isSecureConnected ? (
            <button
              type="button"
              onClick={() => openReferral(referralUrl)}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded border border-terminal-border py-2 text-[10px] font-bold uppercase text-slate-500 hover:text-slate-300 hover:border-white/20"
            >
              Open account
              <ExternalLink className="h-3 w-3 opacity-60" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openReferral(referralUrl)}
              className="mt-3 w-full text-center text-[9px] text-slate-600 hover:text-slate-400 underline-offset-2 hover:underline"
            >
              Open BingX account
              <ExternalLink className="inline h-2.5 w-2.5 ml-0.5 opacity-60" />
            </button>
          )}
        </div>

        <footer className="border-t border-terminal-border px-5 py-3 text-center text-[9px] text-slate-600 space-y-1">
          {footerLines.map((line) => (
            <p key={line} className="leading-snug">
              {line}
            </p>
          ))}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
