import { MarketDataGateway } from "../../market-gateway";
import { getOrderBook } from "../orderbookService";
import { getFirstConnectedConnectionForUser } from "../exchanges/bingx/bingxCredentialStore";
import {
  getBingXReadOnlyHealth,
} from "../exchanges/bingx/bingxReadOnlyService";
import { getExecutionStatus } from "../execution/executionGateway";
import { getPaperState } from "../paperTrading/paperStore";
import { runWithPaperUser } from "../paperTrading/paperUserContext";
import { buildReadOnlyRiskMirrorSnapshot } from "../riskMirror/riskMirrorService";
import type { ReadOnlyRiskMirrorSnapshot } from "../riskMirror/riskMirrorTypes";
import { getAuditEvents } from "./auditLogService";
import { emitRiskMirrorAuditsFromSnapshotSafe } from "./riskMirrorAudits";

export type SystemHealthOverallStatus =
  | "healthy"
  | "degraded"
  | "error"
  | "unknown";

export interface RiskMirrorSystemHealth {
  status: "healthy" | "degraded" | "error" | "inactive" | "unknown";
  active: boolean;
  exchange: "bingx" | "none";
  mode: "read-only";
  symbol?: string;
  scoreStatus?: "aligned" | "neutral" | "conflicted" | "danger" | "unknown";
  scoreConfidence?: number;
  summary?: string;
  warningsCount: number;
  dangerWarningsCount: number;
  warningWarningsCount: number;
  lastCheckedTime?: number;
  positionOpen: boolean;
  tradingLocked: true;
  message?: string;
  recentWarnings?: Array<{
    id: string;
    severity: "info" | "warning" | "danger";
    title: string;
    message: string;
  }>;
}

export interface SystemHealthSnapshot {
  timestamp: number;
  overall: SystemHealthOverallStatus;
  bingx: {
    hasConnection: boolean;
    connectionId?: string;
    health?: string;
    lastSyncTime?: number;
  };
  paper: {
    available: boolean;
    openPosition: boolean;
    pendingOrders: number;
  };
  marketData: {
    tickerFresh: boolean;
    orderbookLevels: number;
  };
  securityGuard: {
    liveTradingEnabled: boolean;
    tradingLocked: boolean;
  };
  riskMirror: RiskMirrorSystemHealth;
}

const DEFAULT_SYMBOL = "BTC-USDT";

function countWarnings(snapshot: ReadOnlyRiskMirrorSnapshot) {
  const actionable = snapshot.warnings.filter(
    (w) => w.id !== "trading_locked",
  );
  return {
    total: actionable.length,
    danger: actionable.filter((w) => w.severity === "danger").length,
    warning: actionable.filter((w) => w.severity === "warning").length,
  };
}

function buildRiskMirrorHealthFromSnapshot(
  snapshot: ReadOnlyRiskMirrorSnapshot,
  connectionId: string,
): RiskMirrorSystemHealth {
  const counts = countWarnings(snapshot);
  const positionOpen = snapshot.position != null;
  const score = snapshot.score.status;

  let status: RiskMirrorSystemHealth["status"] = "healthy";
  if (!positionOpen) {
    status = "healthy";
  } else if (score === "danger" || counts.danger > 0) {
    status = "degraded";
  } else if (score === "conflicted") {
    status = "degraded";
  } else if (score === "unknown") {
    status = "degraded";
  } else {
    status = "healthy";
  }

  const recentWarnings = snapshot.warnings
    .filter((w) => w.id !== "trading_locked" && w.severity !== "info")
    .slice(0, 5)
    .map((w) => ({
      id: w.id,
      severity: w.severity,
      title: w.title,
      message: w.message,
    }));

  return {
    status,
    active: true,
    exchange: "bingx",
    mode: "read-only",
    symbol: snapshot.symbol,
    scoreStatus: score,
    scoreConfidence: snapshot.score.confidence,
    summary: snapshot.score.summary,
    warningsCount: counts.total,
    dangerWarningsCount: counts.danger,
    warningWarningsCount: counts.warning,
    lastCheckedTime: snapshot.timestamp,
    positionOpen,
    tradingLocked: true,
    message: positionOpen
      ? undefined
      : "No real BingX position open.",
    recentWarnings,
  };
}

function inactiveRiskMirror(message: string): RiskMirrorSystemHealth {
  return {
    status: "inactive",
    active: false,
    exchange: "none",
    mode: "read-only",
    warningsCount: 0,
    dangerWarningsCount: 0,
    warningWarningsCount: 0,
    positionOpen: false,
    tradingLocked: true,
    message,
  };
}

function errorRiskMirror(message: string): RiskMirrorSystemHealth {
  return {
    status: "error",
    active: false,
    exchange: "bingx",
    mode: "read-only",
    warningsCount: 0,
    dangerWarningsCount: 0,
    warningWarningsCount: 0,
    positionOpen: false,
    tradingLocked: true,
    message,
  };
}

function computeOverall(
  security: SystemHealthSnapshot["securityGuard"],
  riskMirror: RiskMirrorSystemHealth,
  bingxHealth?: string,
  tickerFresh?: boolean,
): SystemHealthOverallStatus {
  if (!security.tradingLocked || security.liveTradingEnabled) {
    return "error";
  }

  if (riskMirror.status === "error") {
    return "degraded";
  }

  if (
    riskMirror.positionOpen &&
    (riskMirror.scoreStatus === "danger" ||
      riskMirror.scoreStatus === "conflicted" ||
      riskMirror.status === "degraded")
  ) {
    return "degraded";
  }

  if (bingxHealth === "error") {
    return "degraded";
  }

  if (tickerFresh === false) {
    return "degraded";
  }

  if (riskMirror.status === "inactive") {
    return "healthy";
  }

  return "healthy";
}

export async function buildSystemHealthSnapshot(
  userId: number,
  symbol = DEFAULT_SYMBOL,
): Promise<SystemHealthSnapshot> {
  const now = Date.now();
  const sym = symbol.trim() || DEFAULT_SYMBOL;

  const execution = getExecutionStatus(userId);
  const securityGuard = {
    liveTradingEnabled: execution.liveTradingEnabled,
    tradingLocked: execution.tradingLocked !== false,
  };

  const ticker = MarketDataGateway.getCachedTicker();
  const tickerFresh =
    ticker != null &&
    Number.isFinite(ticker.timestamp) &&
    now - ticker.timestamp < 15_000;

  const ob = getOrderBook();
  const orderbookLevels = ob.bids.length + ob.asks.length;

  const bingxConn = getFirstConnectedConnectionForUser(userId);
  let bingxBlock: SystemHealthSnapshot["bingx"] = {
    hasConnection: Boolean(bingxConn),
  };
  let riskMirror: RiskMirrorSystemHealth = inactiveRiskMirror(
    "Risk Mirror inactive — no BingX read-only connection.",
  );

  if (bingxConn) {
    bingxBlock = {
      hasConnection: true,
      connectionId: bingxConn.id,
    };

    try {
      const healthResult = await getBingXReadOnlyHealth(bingxConn.id, userId);
      bingxBlock.health = healthResult.health;
      bingxBlock.lastSyncTime = healthResult.lastSyncTime;
    } catch {
      bingxBlock.health = "error";
    }

    try {
      const rmSnapshot = await buildReadOnlyRiskMirrorSnapshot(
        bingxConn.id,
        userId,
        sym,
      );
      riskMirror = buildRiskMirrorHealthFromSnapshot(rmSnapshot, bingxConn.id);
      emitRiskMirrorAuditsFromSnapshotSafe(
        userId,
        bingxConn.id,
        sym,
        rmSnapshot,
      );
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message.slice(0, 200)
          : "Risk mirror check failed.";
      riskMirror = errorRiskMirror(msg);
    }
  }

  let paperBlock: SystemHealthSnapshot["paper"] = {
    available: false,
    openPosition: false,
    pendingOrders: 0,
  };

  try {
    paperBlock = runWithPaperUser(userId, () => {
      const state = getPaperState();
      const pos = state.position;
      const hasPos =
        pos != null && pos.side !== "flat" && (pos.quantity ?? 0) > 0;
      const pending = state.orders.filter((o) => o.status === "open").length;
      return {
        available: true,
        openPosition: hasPos,
        pendingOrders: pending,
      };
    });
  } catch {
    paperBlock = { available: false, openPosition: false, pendingOrders: 0 };
  }

  const overall = computeOverall(
    securityGuard,
    riskMirror,
    bingxBlock.health,
    tickerFresh,
  );

  return {
    timestamp: now,
    overall,
    bingx: bingxBlock,
    paper: paperBlock,
    marketData: {
      tickerFresh,
      orderbookLevels,
    },
    securityGuard,
    riskMirror,
  };
}

export async function getSystemHealthForUser(
  userId: number,
  symbol?: string,
): Promise<{ snapshot: SystemHealthSnapshot; recentAudit: Awaited<ReturnType<typeof getAuditEvents>> }> {
  const snapshot = await buildSystemHealthSnapshot(userId, symbol);
  const recentAudit = await getAuditEvents({ userId, limit: 10, includeGlobal: true });
  return { snapshot, recentAudit };
}
