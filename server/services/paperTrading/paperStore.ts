import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { getCurrentPaperUserId } from "./paperUserContext";
import type { ExecutionContextSnapshot } from "../reports/executionContextTypes";
import type { PlaybookMatchResult } from "../reports/playbookMatchTypes";
import type {
  PaperFill,
  PaperLogType,
  PaperPosition,
  PaperTradeLedgerEntry,
  PaperTradingSettings,
  PaperTradingState,
  ResetPaperAccountOptions,
} from "./paperTypes";
import { DEFAULT_PAPER_SETTINGS } from "./paperTypes";

const STORAGE_DIR = path.resolve(process.cwd(), "server", "storage");
const LEGACY_STORAGE_FILE = path.join(STORAGE_DIR, "paper-trading-state.json");

function storageFileForUser(userId: number): string {
  if (userId <= 0) return LEGACY_STORAGE_FILE;
  return path.join(STORAGE_DIR, `paper-trading-user-${userId}.json`);
}

function activeStorageFile(): string {
  return storageFileForUser(getCurrentPaperUserId());
}

function createDefaultAccount(initialBalanceUsdt: number) {
  return {
    balanceUsdt: initialBalanceUsdt,
    availableMarginUsdt: initialBalanceUsdt,
    unrealizedPnlUsdt: 0,
    realizedPnlUsdt: 0,
    equityUsdt: initialBalanceUsdt,
    updatedAt: new Date().toISOString(),
  };
}

export function createDefaultPaperState(): PaperTradingState {
  const settings = { ...DEFAULT_PAPER_SETTINGS, updatedAt: new Date().toISOString() };
  return {
    account: createDefaultAccount(settings.initialBalanceUsdt),
    position: null,
    orders: [],
    logs: [],
    settings,
    fills: [],
    tradeLedger: [],
  };
}

function mergeSettings(raw: Partial<PaperTradingSettings> | undefined): PaperTradingSettings {
  const base = { ...DEFAULT_PAPER_SETTINGS };
  if (!raw || typeof raw !== "object") {
    return { ...base, updatedAt: new Date().toISOString() };
  }
  return {
    initialBalanceUsdt:
      Number.isFinite(Number(raw.initialBalanceUsdt)) && Number(raw.initialBalanceUsdt) > 0
        ? Number(raw.initialBalanceUsdt)
        : base.initialBalanceUsdt,
    makerFeeBps:
      Number.isFinite(Number(raw.makerFeeBps)) && Number(raw.makerFeeBps) >= 0
        ? Number(raw.makerFeeBps)
        : base.makerFeeBps,
    takerFeeBps:
      Number.isFinite(Number(raw.takerFeeBps)) && Number(raw.takerFeeBps) >= 0
        ? Number(raw.takerFeeBps)
        : base.takerFeeBps,
    slippageBps:
      Number.isFinite(Number(raw.slippageBps)) && Number(raw.slippageBps) >= 0
        ? Number(raw.slippageBps)
        : base.slippageBps,
    maxLeverage:
      Number.isFinite(Number(raw.maxLeverage)) && Number(raw.maxLeverage) >= 1
        ? Math.min(125, Number(raw.maxLeverage))
        : base.maxLeverage,
    defaultLeverage:
      Number.isFinite(Number(raw.defaultLeverage)) && Number(raw.defaultLeverage) >= 1
        ? Number(raw.defaultLeverage)
        : base.defaultLeverage,
    defaultMarginMode: raw.defaultMarginMode === "cross" ? "cross" : "isolated",
    allowMarketOrders: raw.allowMarketOrders !== false,
    allowLimitOrders: raw.allowLimitOrders !== false,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

function isValidContextSnapshot(v: unknown): v is ExecutionContextSnapshot {
  if (!v || typeof v !== "object") return false;
  const c = v as ExecutionContextSnapshot;
  return (
    typeof c.timestamp === "number" &&
    c.risk != null &&
    typeof c.risk.stopLossDetected === "boolean" &&
    c.diagnostics != null &&
    Array.isArray(c.diagnostics.warnings) &&
    Array.isArray(c.diagnostics.positives)
  );
}

function isValidPlaybookMatch(v: unknown): v is PlaybookMatchResult {
  if (!v || typeof v !== "object") return false;
  const p = v as PlaybookMatchResult;
  return p.primary != null && typeof p.primary.id === "string";
}

function normalizePosition(raw: unknown): PaperPosition | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as PaperPosition;
  if (p.side === "flat") return null;
  if (p.side !== "long" && p.side !== "short") return null;
  return {
    symbol: String(p.symbol ?? "BTC-USDT"),
    side: p.side,
    quantity: Number(p.quantity) || 0,
    entryPrice: p.entryPrice != null ? Number(p.entryPrice) : null,
    markPrice: p.markPrice != null ? Number(p.markPrice) : null,
    unrealizedPnl: Number(p.unrealizedPnl) || 0,
    leverage: Number(p.leverage) > 0 ? Number(p.leverage) : 5,
    marginMode: p.marginMode === "cross" ? "cross" : "isolated",
    stopLoss: p.stopLoss != null ? Number(p.stopLoss) : null,
    takeProfit: p.takeProfit != null ? Number(p.takeProfit) : null,
    openTradeId:
      typeof p.openTradeId === "string" && p.openTradeId.length > 0
        ? p.openTradeId
        : null,
  };
}

function normalizeLedgerEntry(raw: unknown): PaperTradeLedgerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as PaperTradeLedgerEntry;
  if (typeof t.id !== "string" || typeof t.symbol !== "string") return null;
  const side = t.side === "short" ? "short" : "long";
  const status =
    t.status === "open" ||
    t.status === "closed" ||
    t.status === "cancelled" ||
    t.status === "rejected"
      ? t.status
      : "closed";

  return {
    id: t.id,
    symbol: t.symbol,
    venue: t.venue === "bingx" ? "bingx" : "bingx",
    marketType: t.marketType ?? "perpetual",
    chartSymbol: typeof t.chartSymbol === "string" ? t.chartSymbol : undefined,
    side,
    status,
    entryOrderId: typeof t.entryOrderId === "string" ? t.entryOrderId : undefined,
    exitOrderId: typeof t.exitOrderId === "string" ? t.exitOrderId : undefined,
    entryTime: t.entryTime ?? new Date().toISOString(),
    exitTime: t.exitTime,
    entryPrice: Number(t.entryPrice) || 0,
    exitPrice: t.exitPrice != null ? Number(t.exitPrice) : undefined,
    quantity: Number(t.quantity) || 0,
    notionalUsdt: Number(t.notionalUsdt) || 0,
    leverage: Number(t.leverage) > 0 ? Number(t.leverage) : 5,
    marginMode: t.marginMode === "cross" ? "cross" : "isolated",
    stopLoss: t.stopLoss != null ? Number(t.stopLoss) : null,
    takeProfit: t.takeProfit != null ? Number(t.takeProfit) : null,
    realizedPnlUsdt: Number(t.realizedPnlUsdt) || 0,
    unrealizedPnlUsdt: Number(t.unrealizedPnlUsdt) || 0,
    feesUsdt: Number(t.feesUsdt) || 0,
    rMultiple: t.rMultiple != null ? Number(t.rMultiple) : null,
    setup: typeof t.setup === "string" ? t.setup : undefined,
    tags: Array.isArray(t.tags) ? t.tags.map(String) : undefined,
    mistakes: Array.isArray(t.mistakes) ? t.mistakes.map(String) : undefined,
    notes: typeof t.notes === "string" ? t.notes : undefined,
    contextAtEntry: isValidContextSnapshot(t.contextAtEntry)
      ? t.contextAtEntry
      : undefined,
    contextAtExit: isValidContextSnapshot(t.contextAtExit)
      ? t.contextAtExit
      : undefined,
    playbookAtEntry: isValidPlaybookMatch(t.playbookAtEntry)
      ? t.playbookAtEntry
      : undefined,
    playbookAtExit: isValidPlaybookMatch(t.playbookAtExit)
      ? t.playbookAtExit
      : undefined,
  };
}

function backupCorruptFile(file: string): void {
  try {
    if (!fs.existsSync(file)) return;
    const bak = `${file}.corrupt.${Date.now()}.bak`;
    fs.copyFileSync(file, bak);
    console.warn("[storage] repaired corrupted paper state", path.basename(bak));
  } catch {
    // ignore backup failure
  }
}

function normalizeState(parsed: Partial<PaperTradingState>): PaperTradingState {
  const settings = mergeSettings(parsed.settings);
  if (settings.defaultLeverage > settings.maxLeverage) {
    settings.defaultLeverage = settings.maxLeverage;
  }
  const account = parsed.account ?? createDefaultAccount(settings.initialBalanceUsdt);
  const tradeLedger = Array.isArray(parsed.tradeLedger)
    ? parsed.tradeLedger
        .map(normalizeLedgerEntry)
        .filter((t): t is PaperTradeLedgerEntry => t != null)
        .slice(0, 200)
    : [];

  return {
    account: {
      balanceUsdt: Number(account.balanceUsdt) || settings.initialBalanceUsdt,
      availableMarginUsdt:
        Number(account.availableMarginUsdt) || Number(account.balanceUsdt) || settings.initialBalanceUsdt,
      unrealizedPnlUsdt: Number(account.unrealizedPnlUsdt) || 0,
      realizedPnlUsdt: Number(account.realizedPnlUsdt) || 0,
      equityUsdt:
        Number(account.equityUsdt) ||
        Number(account.balanceUsdt) ||
        settings.initialBalanceUsdt,
      updatedAt: account.updatedAt ?? new Date().toISOString(),
    },
    position: normalizePosition(parsed.position),
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    logs: Array.isArray(parsed.logs) ? parsed.logs.slice(0, 100) : [],
    settings,
    fills: Array.isArray(parsed.fills) ? parsed.fills.slice(0, 500) : [],
    tradeLedger,
  };
}

function ensureStorageDir(): void {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.warn(
      "[storage] failed to ensure paper storage dir:",
      err instanceof Error ? err.message : err,
    );
  }
}

export function getPaperState(): PaperTradingState {
  ensureStorageDir();
  const file = activeStorageFile();
  if (!fs.existsSync(file)) {
    console.log("[storage] created missing storage file", path.basename(file));
    const initial = createDefaultPaperState();
    savePaperState(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<PaperTradingState>;
    if (!parsed.account) return createDefaultPaperState();
    return normalizeState(parsed);
  } catch (err) {
    console.warn(
      "[storage] repaired corrupted paper state",
      path.basename(file),
      err instanceof Error ? err.message : err,
    );
    backupCorruptFile(file);
    return createDefaultPaperState();
  }
}

export function savePaperState(state: PaperTradingState): void {
  ensureStorageDir();
  state.account.updatedAt = new Date().toISOString();
  const file = activeStorageFile();
  try {
    fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  } catch (err) {
    console.error(
      "[paper-storage] write failed",
      path.basename(file),
      err instanceof Error ? err.message : err,
    );
    throw new Error("PAPER_STORAGE_WRITE_FAILED");
  }
}

export function getPaperSettings(): PaperTradingSettings {
  return getPaperState().settings;
}

export function updatePaperSettings(
  partial: Partial<PaperTradingSettings>,
): PaperTradingSettings {
  const state = getPaperState();
  const next = mergeSettings({ ...state.settings, ...partial, updatedAt: new Date().toISOString() });
  if (next.defaultLeverage > next.maxLeverage) {
    next.defaultLeverage = next.maxLeverage;
  }
  state.settings = next;
  savePaperState(state);
  return next;
}

export function resetPaperAccount(options: ResetPaperAccountOptions = {}): PaperTradingState {
  const state = getPaperState();
  const hasAnyFlag =
    options.resetBalance !== undefined ||
    options.resetOrders !== undefined ||
    options.resetPosition !== undefined ||
    options.resetLogs !== undefined ||
    options.resetSettings !== undefined;

  const resetAll = !hasAnyFlag;
  const initial = state.settings.initialBalanceUsdt;

  if (resetAll || options.resetSettings) {
    state.settings = { ...DEFAULT_PAPER_SETTINGS, updatedAt: new Date().toISOString() };
  }

  if (resetAll || options.resetBalance) {
    state.account = createDefaultAccount(state.settings.initialBalanceUsdt);
  }

  if (resetAll || options.resetPosition) {
    state.position = null;
    state.account.unrealizedPnlUsdt = 0;
    syncEquityFromParts(state);
  }

  if (resetAll || options.resetOrders) {
    state.orders = [];
  }

  if (resetAll || options.resetLogs) {
    state.logs = [];
  }

  if (resetAll || options.resetLedger) {
    state.tradeLedger = [];
  }

  if (resetAll || options.resetFills) {
    state.fills = [];
  }

  if (resetAll) {
    state.tradeLedger = [];
    state.fills = [];
  }

  savePaperState(state);
  return state;
}

export function getPaperFills(): PaperFill[] {
  return getPaperState().fills;
}

export function getPaperTradeLedger(): PaperTradeLedgerEntry[] {
  return getPaperState().tradeLedger;
}

function syncEquityFromParts(state: PaperTradingState): void {
  state.account.equityUsdt =
    state.account.balanceUsdt +
    state.account.realizedPnlUsdt +
    state.account.unrealizedPnlUsdt;
}

export function resetPaperState(): PaperTradingState {
  const fresh = createDefaultPaperState();
  savePaperState(fresh);
  return fresh;
}

export function appendLog(state: PaperTradingState, type: PaperLogType, message: string): void {
  state.logs.unshift({
    id: randomUUID(),
    type,
    message,
    timestamp: new Date().toISOString(),
  });
  state.logs = state.logs.slice(0, 100);
}

export function chargeFee(
  state: PaperTradingState,
  notional: number,
  orderType: "market" | "limit",
  label: string,
): number {
  const bps =
    orderType === "market" ? state.settings.takerFeeBps : state.settings.makerFeeBps;
  const feeUsdt = (notional * bps) / 10_000;
  if (feeUsdt <= 0) return 0;
  state.account.balanceUsdt -= feeUsdt;
  state.account.realizedPnlUsdt -= feeUsdt;
  state.account.availableMarginUsdt = Math.max(0, state.account.availableMarginUsdt - feeUsdt);
  appendLog(state, "fill", `${label} fee ${feeUsdt.toFixed(4)} USDT (${bps} bps)`);
  return feeUsdt;
}
