import type { PaperOrderIntent, PaperTradingSettings } from "./paperTypes";
import { getPaperSettings } from "./paperStore";

export function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function readOrderSize(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function readOrderPrice(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return String(raw);
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

export function readLeverage(raw: unknown, fallback: number): number {
  const n = toFiniteNumber(raw, fallback);
  return n > 0 ? n : fallback;
}

/** Accept number | null from JSON; omit when absent */
export function normalizeOrderRiskField(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return String(n);
}

export function normalizeSettingsPatch(
  body: Record<string, unknown>,
): { ok: true; patch: Partial<PaperTradingSettings> } | { ok: false; code: string; message: string } {
  const current = getPaperSettings();
  const patch: Partial<PaperTradingSettings> = {};

  if (body.initialBalanceUsdt !== undefined) {
    const v = toFiniteNumber(body.initialBalanceUsdt, NaN);
    if (!Number.isFinite(v) || v <= 0) {
      return { ok: false, code: "INVALID_PAPER_SETTINGS", message: "initialBalanceUsdt must be > 0" };
    }
    patch.initialBalanceUsdt = v;
  }
  if (body.makerFeeBps !== undefined) {
    const v = toFiniteNumber(body.makerFeeBps, NaN);
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, code: "INVALID_PAPER_SETTINGS", message: "makerFeeBps must be >= 0" };
    }
    patch.makerFeeBps = v;
  }
  if (body.takerFeeBps !== undefined) {
    const v = toFiniteNumber(body.takerFeeBps, NaN);
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, code: "INVALID_PAPER_SETTINGS", message: "takerFeeBps must be >= 0" };
    }
    patch.takerFeeBps = v;
  }
  if (body.slippageBps !== undefined) {
    const v = toFiniteNumber(body.slippageBps, NaN);
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, code: "INVALID_PAPER_SETTINGS", message: "slippageBps must be >= 0" };
    }
    patch.slippageBps = v;
  }
  if (body.maxLeverage !== undefined) {
    const v = toFiniteNumber(body.maxLeverage, NaN);
    if (!Number.isFinite(v) || v < 1 || v > 125) {
      return {
        ok: false,
        code: "INVALID_PAPER_SETTINGS",
        message: "maxLeverage must be between 1 and 125",
      };
    }
    patch.maxLeverage = v;
  }
  if (body.defaultLeverage !== undefined) {
    const v = toFiniteNumber(body.defaultLeverage, NaN);
    if (!Number.isFinite(v) || v < 1) {
      return { ok: false, code: "INVALID_PAPER_SETTINGS", message: "defaultLeverage must be >= 1" };
    }
    patch.defaultLeverage = v;
  }
  if (body.defaultMarginMode !== undefined) {
    if (body.defaultMarginMode !== "isolated" && body.defaultMarginMode !== "cross") {
      return {
        ok: false,
        code: "INVALID_PAPER_SETTINGS",
        message: "defaultMarginMode must be isolated or cross",
      };
    }
    patch.defaultMarginMode = body.defaultMarginMode;
  }
  if (body.allowMarketOrders !== undefined) {
    patch.allowMarketOrders = Boolean(body.allowMarketOrders);
  }
  if (body.allowLimitOrders !== undefined) {
    patch.allowLimitOrders = Boolean(body.allowLimitOrders);
  }

  const maxLev = patch.maxLeverage ?? current.maxLeverage;
  const defLev = patch.defaultLeverage ?? current.defaultLeverage;
  if (defLev > maxLev) {
    return {
      ok: false,
      code: "INVALID_PAPER_SETTINGS",
      message: `defaultLeverage (${defLev}) cannot exceed maxLeverage (${maxLev})`,
    };
  }

  return { ok: true, patch };
}

export function normalizeOrderBody(body: Record<string, unknown>): Partial<PaperOrderIntent> {
  const settings = getPaperSettings();
  const size = readOrderSize(body.size);
  const leverage = readLeverage(body.leverage, settings.defaultLeverage);
  return {
    symbol: typeof body.symbol === "string" ? body.symbol : "BTC-USDT",
    side: body.side === "short" ? "short" : body.side === "long" ? "long" : undefined,
    type: body.type === "limit" ? "limit" : body.type === "market" ? "market" : undefined,
    price: readOrderPrice(body.price),
    size: size ?? undefined,
    sizeUnit:
      body.sizeUnit === "BTC" || body.sizeUnit === "%" ? body.sizeUnit : "USDT",
    leverage: String(leverage),
    marginMode:
      body.marginMode === "cross"
        ? "cross"
        : body.marginMode === "isolated"
          ? "isolated"
          : settings.defaultMarginMode,
    reduceOnly: Boolean(body.reduceOnly),
    postOnly: Boolean(body.postOnly),
    stopLoss: normalizeOrderRiskField(body.stopLoss),
    takeProfit: normalizeOrderRiskField(body.takeProfit),
  };
}

const MAX_SETUP_LEN = 200;
const MAX_NOTES_LEN = 2000;
const MAX_TAG_LEN = 50;
const MAX_TAGS = 20;
const MAX_MISTAKES = 20;

function normalizeStringArray(
  raw: unknown,
  label: string,
): { ok: true; value: string[] } | { ok: false; message: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, message: `${label} must be an array of strings` };
  }
  if (raw.length > MAX_MISTAKES) {
    return { ok: false, message: `${label} exceeds maximum items (${MAX_MISTAKES})` };
  }
  const value: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return { ok: false, message: `${label} must contain only strings` };
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_TAG_LEN) {
      return { ok: false, message: `${label} entries must be at most ${MAX_TAG_LEN} characters` };
    }
    value.push(trimmed);
  }
  return { ok: true, value };
}

export function normalizeTradeMetadataPatch(
  body: Record<string, unknown>,
):
  | {
      ok: true;
      patch: { setup?: string; tags?: string[]; mistakes?: string[]; notes?: string };
    }
  | { ok: false; message: string } {
  const patch: {
    setup?: string;
    tags?: string[];
    mistakes?: string[];
    notes?: string;
  } = {};

  if (body.setup !== undefined) {
    if (typeof body.setup !== "string") {
      return { ok: false, message: "setup must be a string" };
    }
    const setup = body.setup.trim();
    if (setup.length > MAX_SETUP_LEN) {
      return { ok: false, message: `setup must be at most ${MAX_SETUP_LEN} characters` };
    }
    patch.setup = setup;
  }

  if (body.tags !== undefined) {
    const tags = normalizeStringArray(body.tags, "tags");
    if (!tags.ok) return tags;
    if (tags.value.length > MAX_TAGS) {
      return { ok: false, message: `tags must have at most ${MAX_TAGS} items` };
    }
    patch.tags = tags.value;
  }

  if (body.mistakes !== undefined) {
    const mistakes = normalizeStringArray(body.mistakes, "mistakes");
    if (!mistakes.ok) return mistakes;
    patch.mistakes = mistakes.value;
  }

  if (body.notes !== undefined) {
    if (typeof body.notes !== "string") {
      return { ok: false, message: "notes must be a string" };
    }
    const notes = body.notes.trim();
    if (notes.length > MAX_NOTES_LEN) {
      return { ok: false, message: `notes must be at most ${MAX_NOTES_LEN} characters` };
    }
    patch.notes = notes;
  }

  if (
    patch.setup === undefined &&
    patch.tags === undefined &&
    patch.mistakes === undefined &&
    patch.notes === undefined
  ) {
    return { ok: false, message: "No metadata fields to update" };
  }

  return { ok: true, patch };
}
