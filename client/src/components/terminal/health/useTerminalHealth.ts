import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarketEngineInternals } from "@/stores/marketEngineStore";
import type {
  BingXReadOnlyHealthResponse,
  BingXReadOnlySnapshot,
  ExecutionRiskGuardState,
  PaperAccountSnapshot,
  PaperOrderSnapshot,
  PaperPositionSnapshot,
} from "../execution/executionTypes";
import { bingxApiFetch } from "../execution/bingxApiClient";
import { paperApiFetch } from "../execution/paperApiClient";
import { formatLastSyncAgo } from "../execution/bingxReadOnlyMessages";
import {
  loadBrokerSession,
  BROKER_SESSION_STORAGE_KEY,
} from "../execution/brokerSessionState";
import { hasPersistedBingXConnection } from "../execution/bingxSession";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "../execution/executionContext";
import { DEFAULT_RISK_GUARD } from "../execution/executionMockState";
import {
  getTerminalAuditEntries,
  severityToLevel,
  subscribeTerminalAudit,
  summarizeAuditMetadata,
} from "./terminalAuditLog";
import { usePersistentAuditLog } from "./usePersistentAuditLog";
import type { TerminalAuditEntry } from "./auditTypes";
import type { HealthTone } from "./healthUi";
import {
  overallHealthTone,
  riskMirrorGlobalBadgeLabel,
  riskMirrorGlobalBadgeTone,
  riskMirrorScoreLabel,
  riskMirrorScoreTone,
  riskMirrorStatusLabel,
  riskMirrorStatusTone,
} from "./healthMappers";
import { useSystemHealth } from "./useSystemHealth";
import { useLiveTradingReadiness } from "./useLiveTradingReadiness";

function agoFromTs(ts?: number): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 3) return "just now";
  if (sec < 60) return `${sec}s ago`;
  return formatLastSyncAgo(ts);
}

function feedTone(ageSec: number | null, staleSec: number): HealthTone {
  if (ageSec == null) return "off";
  if (ageSec <= staleSec) return "ok";
  if (ageSec <= staleSec * 3) return "warn";
  return "error";
}

export function useTerminalHealth() {
  const [brokerSession, setBrokerSession] = useState(loadBrokerSession);
  const [auditTick, setAuditTick] = useState(0);
  const [marketTick, setMarketTick] = useState(0);

  useEffect(() => {
    const sync = () => setBrokerSession(loadBrokerSession());
    window.addEventListener("goodtrading-broker-session-changed", sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === BROKER_SESSION_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("goodtrading-broker-session-changed", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    return subscribeTerminalAudit(() => setAuditTick((n) => n + 1));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setMarketTick((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const bingxActive =
    brokerSession.exchange === "bingx" &&
    brokerSession.connectionMode === "read-only" &&
    brokerSession.connected &&
    Boolean(brokerSession.connectionId);

  const paperActive =
    brokerSession.exchange === "paper" &&
    brokerSession.connectionMode === "paper" &&
    brokerSession.connected;

  const executionSymbol =
    DEFAULT_TERMINAL_EXECUTION_CONTEXT.executionSymbol ?? "BTC-USDT";

  const bingxCanSync = bingxActive && hasPersistedBingXConnection(brokerSession);
  const connectionId = brokerSession.connectionId;

  const { data: bingxHealth } = useQuery<BingXReadOnlyHealthResponse>({
    queryKey: ["/api/bingx/read-only/health", connectionId, "system-health"],
    queryFn: async () => {
      const res = await bingxApiFetch(
        `/api/bingx/read-only/health?connectionId=${encodeURIComponent(connectionId!)}`,
        { assertOk: false },
      );
      return (await res.json()) as BingXReadOnlyHealthResponse;
    },
    enabled: bingxCanSync,
    refetchInterval: bingxCanSync ? 10_000 : false,
    staleTime: 6_000,
  });

  const { data: bingxSnapshot, isError: snapshotError } = useQuery<BingXReadOnlySnapshot>({
    queryKey: ["/api/bingx/read-only/snapshot", connectionId, executionSymbol, "system-health"],
    queryFn: async () => {
      const params = new URLSearchParams({
        connectionId: connectionId!,
        symbol: executionSymbol,
      });
      const res = await bingxApiFetch(`/api/bingx/read-only/snapshot?${params}`, {
        assertOk: false,
      });
      const json = (await res.json()) as {
        success?: boolean;
        snapshot?: BingXReadOnlySnapshot;
      };
      if (!json.success || !json.snapshot) {
        throw new Error("Snapshot unavailable");
      }
      return json.snapshot;
    },
    enabled: bingxCanSync,
    refetchInterval: bingxCanSync ? 10_000 : false,
    staleTime: 6_000,
    retry: 1,
  });

  const { data: paperAccount } = useQuery<PaperAccountSnapshot>({
    queryKey: ["/api/paper/account"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/account");
      return res.json() as Promise<PaperAccountSnapshot>;
    },
    enabled: paperActive,
    refetchInterval: paperActive ? 6_000 : false,
  });

  const { data: paperPositionData } = useQuery<{ position: PaperPositionSnapshot | null }>({
    queryKey: ["/api/paper/position"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/position");
      return res.json() as Promise<{ position: PaperPositionSnapshot | null }>;
    },
    enabled: paperActive,
    refetchInterval: paperActive ? 6_000 : false,
  });

  const { data: paperOrdersData } = useQuery<{ orders: PaperOrderSnapshot[] }>({
    queryKey: ["/api/paper/orders"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/orders");
      return res.json() as Promise<{ orders: PaperOrderSnapshot[] }>;
    },
    enabled: paperActive,
    refetchInterval: paperActive ? 6_000 : false,
  });

  const { data: executionStatus } = useQuery<ExecutionRiskGuardState & {
    liveTradingEnabled: boolean;
    tradingLocked?: boolean;
    permissions?: string;
  }>({
    queryKey: ["/api/execution/status"],
    queryFn: async () => {
      const res = await fetch("/api/execution/status");
      if (!res.ok) throw new Error("Status unavailable");
      return res.json() as ExecutionRiskGuardState & {
        liveTradingEnabled: boolean;
        tradingLocked?: boolean;
        permissions?: string;
      };
    },
    refetchInterval: 15_000,
    staleTime: 8_000,
  });

  const { data: tickerData, dataUpdatedAt: tickerUpdatedAt } = useQuery<{
    price: number;
    timestamp?: number;
  }>({
    queryKey: ["btc-ticker", "system-health"],
    queryFn: async () => {
      const res = await fetch("/api/market/ticker?symbol=BTCUSDT");
      if (!res.ok) throw new Error("Ticker failed");
      return res.json() as { price: number; timestamp?: number };
    },
    refetchInterval: 5_000,
    staleTime: 3_000,
    retry: 1,
  });

  const { data: orderbookRaw, dataUpdatedAt: obUpdatedAt, isError: obError } = useQuery<{
    bids?: unknown[];
    asks?: unknown[];
  }>({
    queryKey: ["orderbook-raw", "system-health"],
    queryFn: async () => {
      const res = await fetch("/api/orderbook/raw");
      if (!res.ok) throw new Error("Orderbook failed");
      return res.json();
    },
    refetchInterval: 8_000,
    staleTime: 4_000,
    retry: 1,
  });

  const marketInternals = useMemo(() => {
    void marketTick;
    return getMarketEngineInternals();
  }, [marketTick]);

  const candleAgeSec = marketInternals.lastUpdateTs
    ? Math.floor((Date.now() - marketInternals.lastUpdateTs) / 1000)
    : null;

  const tickerAgeSec = tickerUpdatedAt
    ? Math.floor((Date.now() - tickerUpdatedAt) / 1000)
    : null;

  const obAgeSec = obUpdatedAt
    ? Math.floor((Date.now() - obUpdatedAt) / 1000)
    : null;

  const heatmapActive = useMemo(() => {
    try {
      const raw = localStorage.getItem("terminal-activePanels");
      if (!raw) return false;
      const parsed = JSON.parse(raw) as string[];
      return Array.isArray(parsed) && parsed.includes("HEATMAP");
    } catch {
      return false;
    }
  }, [marketTick]);

  const pendingPaper = useMemo(
    () =>
      (paperOrdersData?.orders ?? []).filter(
        (o) => o.status === "open" || o.status === "pending" || o.status === "partial",
      ),
    [paperOrdersData?.orders],
  );

  const paperPosition = paperPositionData?.position ?? null;
  const hasPaperPosition =
    paperPosition != null &&
    paperPosition.side !== "flat" &&
    paperPosition.quantity > 0;

  const bingxHealthVal = bingxHealth?.health ?? (bingxCanSync ? "checking" : "off");
  const bingxConnectionTone: HealthTone =
    !bingxActive
      ? "off"
      : bingxHealthVal === "healthy"
        ? "ok"
        : bingxHealthVal === "degraded"
          ? "warn"
          : bingxHealthVal === "error"
            ? "error"
            : "neutral";

  const snapshotTone: HealthTone = !bingxCanSync
    ? "off"
    : snapshotError
      ? "error"
      : bingxSnapshot
        ? "ok"
        : "warn";

  const risk = executionStatus ?? DEFAULT_RISK_GUARD;
  const liveLocked = !risk.liveTradingEnabled || risk.tradingLocked !== false;

  const {
    events: persistentAuditEvents,
    isPersistentAvailable,
    isError: persistentAuditError,
    refetch: refetchPersistentAudit,
  } = usePersistentAuditLog(80);

  const auditEntries = useMemo((): TerminalAuditEntry[] => {
    void auditTick;
    if (isPersistentAvailable && persistentAuditEvents.length > 0) {
      return persistentAuditEvents.map((e) => ({
        id: e.id,
        ts: e.timestamp,
        type: e.type,
        level: severityToLevel(e.severity),
        message: e.message,
        metadataSummary: summarizeAuditMetadata(e.metadata),
        persistent: true,
      }));
    }
    if (isPersistentAvailable) {
      return [];
    }
    return [...getTerminalAuditEntries()];
  }, [auditTick, isPersistentAvailable, persistentAuditEvents]);

  const auditSource: "persistent" | "local_fallback" = isPersistentAvailable
    ? "persistent"
    : "local_fallback";

  const {
    snapshot: serverHealth,
    overall: serverOverall,
    riskMirror: serverRiskMirror,
    refetch: refetchSystemHealth,
  } = useSystemHealth(true);

  const {
    readiness: liveReadiness,
    isLoading: liveReadinessLoading,
    refetch: refetchLiveReadiness,
  } = useLiveTradingReadiness(bingxActive);

  const refresh = useCallback(() => {
    setMarketTick((n) => n + 1);
    setBrokerSession(loadBrokerSession());
    void refetchPersistentAudit();
    void refetchSystemHealth();
    void refetchLiveReadiness();
  }, [refetchPersistentAudit, refetchSystemHealth, refetchLiveReadiness]);

  const riskMirrorBadgeLabel = riskMirrorGlobalBadgeLabel(serverRiskMirror);
  const riskMirrorBadgeTone = riskMirrorGlobalBadgeTone(serverRiskMirror);

  return {
    serverOverall,
    serverOverallTone: overallHealthTone(serverOverall),
    brokerSession,
    bingx: {
      active: bingxActive,
      connectionTone: bingxConnectionTone,
      connectionLabel: bingxActive
        ? bingxHealthVal === "checking"
          ? "checking"
          : bingxHealthVal
        : "inactive",
      lastSync: bingxHealth?.lastSyncTime
        ? formatLastSyncAgo(bingxHealth.lastSyncTime)
        : bingxSnapshot?.lastSyncTime
          ? formatLastSyncAgo(bingxSnapshot.lastSyncTime)
          : "—",
      latencyMs:
        bingxHealth?.latencyMs != null && Number.isFinite(bingxHealth.latencyMs)
          ? `${Math.round(bingxHealth.latencyMs)} ms`
          : "—",
      snapshotStatus: !bingxCanSync
        ? "inactive"
        : snapshotError
          ? "error"
          : bingxSnapshot
            ? `ok · ${bingxSnapshot.positions.length} pos · ${bingxSnapshot.openOrders.length} orders`
            : "loading",
      snapshotTone,
      permissions: bingxSnapshot?.permissions ?? bingxHealth?.permissions,
      syncError: snapshotError,
    },
    paper: {
      active: paperActive,
      activeTone: (paperActive ? "ok" : "off") as HealthTone,
      accountLabel: !paperActive
        ? "inactive"
        : paperAccount
          ? `${(paperAccount.equityUsdt ?? 0).toFixed(2)} USDT equity`
          : "loading",
      pendingCount: pendingPaper.length,
      openPosition: hasPaperPosition
        ? `${paperPosition!.side.toUpperCase()} · ${paperPosition!.quantity} BTC`
        : "none",
    },
    market: {
      candlesTone: feedTone(candleAgeSec, 30),
      candlesLabel: marketInternals.baseLen
        ? `${marketInternals.baseLen} bars · ${agoFromTs(marketInternals.lastUpdateTs)} · ${marketInternals.lastPackMode}`
        : "no data",
      tickerTone: feedTone(tickerAgeSec, 12),
      tickerLabel: tickerData?.price
        ? `${tickerData.price.toFixed(2)} · ${agoFromTs(tickerUpdatedAt)}`
        : "—",
      orderbookTone: obError ? "error" : feedTone(obAgeSec, 15),
      orderbookLabel: obError
        ? "error"
        : orderbookRaw
          ? `${(orderbookRaw.bids?.length ?? 0) + (orderbookRaw.asks?.length ?? 0)} levels · ${agoFromTs(obUpdatedAt)}`
          : "—",
      heatmapTone: (heatmapActive ? (obError ? "warn" : "ok") : "off") as HealthTone,
      heatmapLabel: heatmapActive
        ? obError
          ? "panel on · feed error"
          : "panel on · bookmap feed"
        : "panel off",
    },
    security: {
      liveTradingTone: liveLocked ? "ok" : "error",
      liveTradingLabel: risk.liveTradingEnabled ? "UNLOCKED" : "LOCKED",
      apiTradingTone: liveLocked ? "ok" : "warn",
      apiTradingLabel: risk.permissions === "trading" ? "enabled" : "disabled",
      endpointsTone: "ok" as HealthTone,
      endpointsLabel: "real order routes return 403",
      maxNotional: risk.maxNotionalUsdt,
      maxLeverage: risk.maxLeverage,
    },
    audit: auditEntries,
    auditSource,
    auditPersistentUnavailable: persistentAuditError && !isPersistentAvailable,
    riskMirror: {
      status: serverRiskMirror?.status,
      statusLabel: riskMirrorStatusLabel(serverRiskMirror),
      statusTone: riskMirrorStatusTone(serverRiskMirror?.status),
      active: serverRiskMirror?.active ?? false,
      exchange: serverRiskMirror?.exchange ?? "none",
      mode: serverRiskMirror?.mode ?? "read-only",
      symbol: serverRiskMirror?.symbol,
      scoreStatus: serverRiskMirror?.scoreStatus,
      scoreLabel: riskMirrorScoreLabel(serverRiskMirror?.scoreStatus),
      scoreTone: riskMirrorScoreTone(serverRiskMirror?.scoreStatus),
      scoreConfidence: serverRiskMirror?.scoreConfidence,
      summary: serverRiskMirror?.summary,
      message: serverRiskMirror?.message,
      warningsCount: serverRiskMirror?.warningsCount ?? 0,
      dangerWarningsCount: serverRiskMirror?.dangerWarningsCount ?? 0,
      warningWarningsCount: serverRiskMirror?.warningWarningsCount ?? 0,
      positionOpen: serverRiskMirror?.positionOpen ?? false,
      tradingLocked: serverRiskMirror?.tradingLocked ?? true,
      recentWarnings: serverRiskMirror?.recentWarnings ?? [],
      globalBadgeLabel: riskMirrorBadgeLabel,
      globalBadgeTone: riskMirrorBadgeTone,
    },
    serverHealth,
    liveReadiness,
    liveReadinessLoading,
    liveTradingSummary: serverHealth?.liveTrading ?? null,
    refresh,
  };
}
