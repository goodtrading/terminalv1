import { apiUrl } from "../../../lib/apiBase";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TerminalPanel } from "../TerminalPanel";
import { cn } from "@/lib/utils";
import { Star, ExternalLink, Settings } from "lucide-react";
import { PaperTradingSettingsModal } from "./PaperTradingSettingsModal";
import type {
  BrokerConnectionPhase,
  ExchangeConnectionState,
} from "./executionTypes";
import {
  BINGX_REFERRAL_URL,
  DEFAULT_EXCHANGE_CONNECTIONS,
} from "./executionMockState";
import { BingXConnectionModal } from "./BingXConnectionModal";
import { BingXReadOnlyConnectionCard } from "./BingXReadOnlyConnectionCard";
import { BingXSavedConnectionCard } from "./BingXSavedConnectionCard";
import { isBingXReadOnlySession, isBingXSecureApiSession } from "./bingxSession";
import { useBrokerSession } from "./useBrokerSession";
import { EXCHANGE_PANEL_SLOT_ORDER } from "./exchangeVisualOrder";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { DesktopEmptyState } from "@/components/desktop/DesktopEmptyState";

function openReferral(url: string) {
  void openExternalUrl(url, { source: "bingx_register" }).catch((error) => {
    console.warn("[BingX Register]", error);
  });
}

function bingxStatusLabel(
  phase: BrokerConnectionPhase,
  secureApi?: boolean,
): string {
  switch (phase) {
    case "connecting":
    case "checking":
      return "Connecting";
    case "broker_login_unavailable":
      return "Broker login unavailable";
    case "connected_demo":
      return "Connected demo";
    case "connected":
      return secureApi ? "Connected read-only" : "Connected";
    case "error":
      return "Error";
    default:
      return "Not connected";
  }
}

function bingxHealthLabel(phase: BrokerConnectionPhase): string {
  switch (phase) {
    case "connecting":
    case "checking":
      return "Checking";
    case "broker_login_unavailable":
      return "Waiting";
    case "connected_demo":
      return "Demo";
    case "connected":
      return "Online";
    case "error":
      return "Error";
    default:
      return "Ready";
  }
}

type ExchangeCardProps = {
  exchange: ExchangeConnectionState;
  bingxPhase?: BrokerConnectionPhase;
  bingxConnected?: boolean;
  bingxDemo?: boolean;
  bingxSecureApi?: boolean;
  paperConnected?: boolean;
  apiKeyMasked?: string;
  onConnect: () => void;
  onManage?: () => void;
  onDisconnect?: () => void;
  onOpenPaperSettings?: () => void;
  brokerBackgroundBusy?: boolean;
};

function ExchangeCard({
  exchange,
  bingxPhase,
  bingxConnected,
  bingxDemo,
  bingxSecureApi,
  paperConnected,
  apiKeyMasked,
  onConnect,
  onManage,
  onDisconnect,
  onOpenPaperSettings,
  brokerBackgroundBusy = false,
}: ExchangeCardProps) {
  const disabled = exchange.status === "coming_soon";
  const referral = exchange.referralUrl ?? BINGX_REFERRAL_URL;
  const isBingx = exchange.id === "bingx";
  const isPaper = exchange.id === "paper";
  const phase = isBingx ? (bingxPhase ?? "not_connected") : null;
  const statusText = (() => {
    if (isPaper && paperConnected) return "Connected";
    if (isBingx && phase) return bingxStatusLabel(phase, bingxSecureApi);
    if (exchange.status === "coming_soon") return "Coming soon";
    return "Ready";
  })();
  const healthText = (() => {
    if (isPaper && paperConnected) return "Active";
    if (isBingx && phase) return bingxHealthLabel(phase);
    if (exchange.status === "coming_soon") return "Coming soon";
    return "Ready";
  })();
  const connecting =
    !brokerBackgroundBusy &&
    (phase === "connecting" || phase === "checking");
  const showDisconnect =
    (isBingx && bingxConnected && onDisconnect) || (isPaper && paperConnected && onDisconnect);

  const connectLabel = (() => {
    if (isPaper) return paperConnected ? "Disconnect" : "Connect";
    if (!isBingx) return "Connect";
    if (connecting) return "Connecting";
    if (bingxConnected) return "Manage";
    if (phase === "error") return "Retry";
    return "Connect API";
  })();

  return (
    <div
      className={cn(
        "group flex gap-3 rounded border border-terminal-border bg-[#0a0a0a] p-2.5 transition-colors",
        !disabled && "hover:border-white/20 hover:bg-white/[0.02]",
        disabled && "opacity-70",
      )}
    >
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-terminal-border/60 bg-[#0a0a0a]">
        <img
          src={exchange.logoUrl}
          alt={`${exchange.name} logo`}
          className={cn(
            "h-full w-full object-cover",
            exchange.id === "bingx" && "object-[center_28%]",
          )}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-white">{exchange.name}</span>
              {exchange.ratingLabel ? (
                <span className="text-[9px] font-mono text-cyan-400/90">{exchange.ratingLabel}</span>
              ) : exchange.rating != null ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] text-amber-400/90">
                  <Star className="h-2.5 w-2.5 fill-amber-400/70" />
                  {exchange.rating.toFixed(1)}
                </span>
              ) : null}
              {isPaper ? (
                <span className="inline-flex items-center gap-1">
                  <span className="rounded border border-cyan-500/35 bg-cyan-500/10 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider text-cyan-300">
                    PAPER
                  </span>
                  {onOpenPaperSettings ? (
                    <button
                      type="button"
                      title="Paper settings"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPaperSettings();
                      }}
                      className="rounded border border-terminal-border/80 p-0.5 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/40 transition-colors"
                    >
                      <Settings className="h-3 w-3" />
                    </button>
                  ) : null}
                </span>
              ) : null}
              {isBingx && bingxSecureApi ? (
                <span className="rounded border border-emerald-500/35 bg-emerald-500/10 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider text-emerald-300">
                  Read-only
                </span>
              ) : null}
              {isBingx && bingxDemo ? (
                <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider text-amber-300">
                  Demo
                </span>
              ) : null}
            </div>
            <p className="text-[9px] text-slate-500 mt-0.5 leading-tight">
              {exchange.description}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {exchange.badge ? (
              <span
                className={cn(
                  "rounded px-1 py-0.5 text-[7px] font-bold uppercase tracking-wider",
                  exchange.badge === "PAPER"
                    ? "border border-cyan-500/35 bg-cyan-500/10 text-cyan-300"
                    : exchange.badge.includes("PARTNER")
                      ? "border border-cyan-500/35 bg-cyan-500/10 text-cyan-300"
                      : "border border-slate-600 bg-slate-800/80 text-slate-400",
                )}
              >
                {exchange.badge}
              </span>
            ) : null}
            <span className="text-[8px] text-slate-500">{healthText}</span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[8px] font-mono text-slate-500">
          <span>{statusText}</span>
          {isPaper && paperConnected ? (
            <>
              <span>·</span>
              <span className="text-cyan-400/80">Internal simulated broker connected</span>
            </>
          ) : null}
          {isBingx && apiKeyMasked ? (
            <>
              <span>·</span>
              <span>{apiKeyMasked}</span>
            </>
          ) : null}
          {!isPaper ? (
            <>
              <span>·</span>
              <span>{isBingx && bingxSecureApi ? "Secure API" : isBingx ? "Broker login" : "Market data"}</span>
            </>
          ) : null}
          {exchange.tradingLocked ? (
            <>
              <span>·</span>
              <span className="text-amber-500/80">Trading locked</span>
            </>
          ) : null}
        </div>

        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            disabled={disabled || (isBingx && connecting)}
            onClick={() => {
              if (disabled) return;
              if (isPaper && paperConnected && onDisconnect) {
                onDisconnect();
                return;
              }
              if (isBingx && bingxConnected && onManage) {
                onManage();
                return;
              }
              onConnect();
            }}
            className={cn(
              "flex-1 rounded border py-1 text-[9px] font-bold uppercase tracking-wider transition-colors",
              disabled || (isBingx && connecting)
                ? "border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed"
                : "border-cyan-500/45 bg-cyan-600/15 text-cyan-100 hover:bg-cyan-600/25",
            )}
          >
            {connectLabel}
          </button>
          {showDisconnect && !isPaper ? (
            <button
              type="button"
              onClick={onDisconnect}
              className="rounded border border-terminal-border px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-white hover:border-white/25"
            >
              Disconnect
            </button>
          ) : !isPaper ? (
            <button
              type="button"
              disabled={disabled || !referral}
              onClick={() => referral && openReferral(referral)}
              className={cn(
                "rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-wider transition-colors inline-flex items-center gap-1",
                disabled
                  ? "border-slate-800 text-slate-600 cursor-not-allowed"
                  : "border-terminal-border text-slate-400 hover:text-white hover:border-white/25",
              )}
            >
              {isBingx && !disabled ? "Register with BingX" : "Register"}
              {!disabled ? <ExternalLink className="h-2.5 w-2.5" /> : null}
            </button>
          ) : null}
        </div>
        {isPaper ? (
          <p className="mt-1.5 text-[8px] text-slate-600 leading-snug">
            Practice execution with zero real risk. Uses internal paper engine.
          </p>
        ) : null}
        {disabled && exchange.id === "binance" ? (
          <div className="mt-2">
            <DesktopEmptyState
              compact
              status="coming-soon"
              title="Binance integration coming soon"
              description="Market data and broker connection for Binance will be available in a future release."
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ExchangeConnectionPanel({ collapsed = false }: { collapsed?: boolean }) {
  const [exchanges, setExchanges] = useState<ExchangeConnectionState[]>(
    DEFAULT_EXCHANGE_CONNECTIONS,
  );
  const [bingxModalOpen, setBingxModalOpen] = useState(false);
  const [paperSettingsOpen, setPaperSettingsOpen] = useState(false);
  const {
    session,
    savedBingXConnections,
    disconnectBroker,
    deleteSavedBingXConnection,
    activateSavedBingXConnection,
    connectPaperTrading,
    disconnectPaperTrading,
    restoreLoading,
    loginStatusLoading,
  } = useBrokerSession();

  const primarySavedBingX = savedBingXConnections[0];

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/exchanges/status"));
      if (!res.ok) return;
      const data = (await res.json()) as {
        exchanges: Array<{
          id: "bingx" | "binance";
          status: ExchangeConnectionState["status"];
          brokerLoginAvailable: boolean;
          brokerLoginUrl?: string | null;
          referralUrl?: string;
          demoAvailable?: boolean;
        }>;
      };
      setExchanges((prev) =>
        prev.map((ex) => {
          const remote = data.exchanges.find((r) => r.id === ex.id);
          if (!remote) return ex;
          return {
            ...ex,
            status: remote.status,
            brokerLoginAvailable: remote.brokerLoginAvailable,
            brokerLoginUrl: remote.brokerLoginUrl ?? undefined,
            referralUrl: remote.referralUrl ?? ex.referralUrl,
            demoConnectionAvailable: remote.demoAvailable ?? false,
          };
        }),
      );
    } catch {
      // keep defaults
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const exchangesById = useMemo(() => {
    const map = new Map<string, ExchangeConnectionState>();
    for (const ex of exchanges) {
      map.set(ex.id, ex);
    }
    return map;
  }, [exchanges]);

  const bingx = exchangesById.get("bingx");

  const bingxPhase =
    session.exchange === "bingx" ? session.phase : ("not_connected" as BrokerConnectionPhase);
  const bingxReadOnly = isBingXReadOnlySession(session);
  const bingxSecureApi = isBingXSecureApiSession(session);
  const bingxApiConnected =
    session.exchange === "bingx" &&
    session.connected &&
    (bingxReadOnly || bingxSecureApi);
  const paperActive =
    session.exchange === "paper" && session.connected && session.connectionMode === "paper";
  const showSavedBingxInactive =
    Boolean(primarySavedBingX) && !bingxApiConnected;
  const brokerBackgroundBusy = restoreLoading || loginStatusLoading;

  return (
    <>
      <TerminalPanel
        title="EXCHANGE CONNECTION"
        collapsed={collapsed}
        noPadding
        className="flex-[0.35] h-full min-w-0 max-[1000px]:flex-1"
      >
        <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-full">
          {EXCHANGE_PANEL_SLOT_ORDER.map((slotId) => {
            const ex = exchangesById.get(slotId);
            if (!ex) return null;

            if (ex.id === "bingx") {
              if (bingxApiConnected) {
                return (
                  <BingXReadOnlyConnectionCard
                    key="bingx-api-connected"
                    session={session}
                    onManage={() => setBingxModalOpen(true)}
                    onDisconnect={() => void disconnectBroker()}
                    onDeleteSaved={() =>
                      void deleteSavedBingXConnection(session.connectionId)
                    }
                  />
                );
              }
              if (showSavedBingxInactive && primarySavedBingX) {
                return (
                  <BingXSavedConnectionCard
                    key="bingx-saved-inactive"
                    session={session}
                    saved={primarySavedBingX}
                    paperActive={paperActive}
                    onUseSaved={() =>
                      activateSavedBingXConnection(primarySavedBingX.id)
                    }
                    onManage={() => setBingxModalOpen(true)}
                    onDeleteSaved={() =>
                      void deleteSavedBingXConnection(primarySavedBingX.id)
                    }
                  />
                );
              }
            }

            if (ex.id === "bingx" && (bingxReadOnly || showSavedBingxInactive)) {
              return null;
            }

            return (
              <ExchangeCard
                key={`exchange-card-${ex.id}`}
                exchange={ex}
                bingxPhase={ex.id === "bingx" ? bingxPhase : undefined}
                bingxConnected={ex.id === "bingx" ? session.connected : false}
                bingxDemo={ex.id === "bingx" ? session.demo : false}
                paperConnected={
                  ex.id === "paper" &&
                  session.exchange === "paper" &&
                  session.connected
                }
                onConnect={() => {
                  if (ex.id === "bingx") {
                    if (primarySavedBingX) {
                      activateSavedBingXConnection(primarySavedBingX.id);
                    } else {
                      setBingxModalOpen(true);
                    }
                  }
                  if (ex.id === "paper") connectPaperTrading();
                }}
                onManage={() => {
                  if (ex.id === "bingx") setBingxModalOpen(true);
                }}
                bingxSecureApi={ex.id === "bingx" && bingxReadOnly}
                apiKeyMasked={
                  ex.id === "bingx"
                    ? session.apiKeyMasked ?? primarySavedBingX?.apiKeyMasked
                    : undefined
                }
                onDisconnect={
                  ex.id === "bingx"
                    ? () => void disconnectBroker()
                    : ex.id === "paper"
                      ? () => disconnectPaperTrading()
                      : undefined
                }
                onOpenPaperSettings={
                  ex.id === "paper" ? () => setPaperSettingsOpen(true) : undefined
                }
                brokerBackgroundBusy={ex.id === "bingx" ? brokerBackgroundBusy : false}
              />
            );
          })}
          <p className="text-[8px] text-slate-600 px-1 leading-snug">
            BingX: secure API read-only or broker login. Paper Trading: internal simulated
            broker — no real funds.
          </p>
        </div>
      </TerminalPanel>

      <BingXConnectionModal
        open={bingxModalOpen}
        onClose={() => setBingxModalOpen(false)}
        referralUrl={bingx?.referralUrl ?? BINGX_REFERRAL_URL}
      />
      <PaperTradingSettingsModal
        open={paperSettingsOpen}
        onClose={() => setPaperSettingsOpen(false)}
      />
    </>
  );
}
