import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  PaperFill,
  PaperLogType,
  PaperTradeLedgerEntry,
  PaperTradingSettings,
  PaperTradingState,
  ResetPaperAccountOptions,
} from "./paperTypes";
import { DEFAULT_PAPER_SETTINGS } from "./paperTypes";

const STORAGE_DIR = path.resolve(process.cwd(), "server", "storage");
const STORAGE_FILE = path.join(STORAGE_DIR, "paper-trading-state.json");

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

function normalizeState(parsed: Partial<PaperTradingState>): PaperTradingState {
  const settings = mergeSettings(parsed.settings);
  if (settings.defaultLeverage > settings.maxLeverage) {
    settings.defaultLeverage = settings.maxLeverage;
  }
  const account = parsed.account ?? createDefaultAccount(settings.initialBalanceUsdt);
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
    position: parsed.position ?? null,
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    logs: Array.isArray(parsed.logs) ? parsed.logs.slice(0, 100) : [],
    settings,
    fills: Array.isArray(parsed.fills) ? parsed.fills.slice(0, 500) : [],
    tradeLedger: Array.isArray(parsed.tradeLedger) ? parsed.tradeLedger.slice(0, 200) : [],
  };
}

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

export function getPaperState(): PaperTradingState {
  ensureStorageDir();
  if (!fs.existsSync(STORAGE_FILE)) {
    const initial = createDefaultPaperState();
    savePaperState(initial);
    return initial;
  }
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<PaperTradingState>;
    if (!parsed.account) return createDefaultPaperState();
    return normalizeState(parsed);
  } catch {
    return createDefaultPaperState();
  }
}

export function savePaperState(state: PaperTradingState): void {
  ensureStorageDir();
  state.account.updatedAt = new Date().toISOString();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2), "utf8");
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
