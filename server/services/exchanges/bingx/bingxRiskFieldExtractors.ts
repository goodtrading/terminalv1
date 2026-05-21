/**
 * Safe extraction of BingX SL/TP/trigger prices from position and order payloads.
 * No secrets — only field shapes and numeric candidates.
 */

export const STOP_LOSS_ALIASES = [
  "stopLossPrice",
  "stopLoss",
  "slPrice",
  "sl",
  "stopPrice",
  "stopLossTriggerPrice",
  "stopLossOrderPrice",
  "stopLossPriceValue",
  "stopLossEntrustPrice",
  "lossStopPrice",
  "lossPrice",
] as const;

export const TAKE_PROFIT_ALIASES = [
  "takeProfitPrice",
  "takeProfit",
  "tpPrice",
  "tp",
  "takeProfitTriggerPrice",
  "takeProfitOrderPrice",
  "takeProfitPriceValue",
  "takeProfitEntrustPrice",
  "profitTakePrice",
  "profitPrice",
] as const;

export const TRIGGER_ALIASES = [
  "triggerPrice",
  "activationPrice",
  "stopPrice",
  "entrustPrice",
  "orderPrice",
  "price",
] as const;

const NESTED_STOP_KEYS = ["stopLoss", "stop_loss", "sl", "stopLossInfo", "stopLossOrder"] as const;
const NESTED_TP_KEYS = ["takeProfit", "take_profit", "tp", "takeProfitInfo", "takeProfitOrder"] as const;

const RISK_SUBKEY_RE =
  /stop|sl|take|tp|trigger|activation|entrust|profit|loss|plan|tpsl/i;
const SKIP_VALUE_KEY_RE =
  /unrealized|wallet|balance|leverage|margin|liquidation|liqprice|roe|commission|fee|id$|orderid|time|timestamp|side|symbol|type|status|mode/i;

export function isBingxRiskDebugEnabled(): boolean {
  const v = process.env.BINGX_DEBUG_ACCOUNT_SYNC;
  return v === "true" || v === "1";
}

export function extractNumericCandidate(
  obj: Record<string, unknown> | null | undefined,
  aliases: readonly string[],
): number | undefined {
  if (!obj) return undefined;
  for (const key of aliases) {
    const v = obj[key];
    const n = coercePositiveNumber(v);
    if (n != null) return n;
  }
  return undefined;
}

function coercePositiveNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function parseMaybeObject(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  if (typeof v === "string" && v.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function extractFromNestedBlocks(
  row: Record<string, unknown>,
  blockKeys: readonly string[],
  aliases: readonly string[],
): number | undefined {
  for (const key of blockKeys) {
    const block = parseMaybeObject(row[key]);
    if (!block) continue;
    const n = extractNumericCandidate(block, aliases);
    if (n != null) return n;
  }
  return undefined;
}

function deepScanRiskNumeric(
  row: Record<string, unknown>,
  mode: "stop" | "take",
  depth = 0,
): number | undefined {
  if (depth > 4) return undefined;

  for (const [key, value] of Object.entries(row)) {
    const kl = key.toLowerCase();
    if (SKIP_VALUE_KEY_RE.test(kl)) continue;

    const matchesStop =
      mode === "stop" &&
      (/stop|sl|loss/i.test(kl) && !/take|tp|profit/i.test(kl));
    const matchesTake =
      mode === "take" && (/take|tp|profit/i.test(kl) && !/stop|sl|loss/i.test(kl));

    if (matchesStop || matchesTake) {
      const direct = coercePositiveNumber(value);
      if (direct != null) return direct;
      const nested = parseMaybeObject(value);
      if (nested) {
        const inner =
          extractNumericCandidate(nested, TRIGGER_ALIASES) ??
          extractNumericCandidate(nested, mode === "stop" ? STOP_LOSS_ALIASES : TAKE_PROFIT_ALIASES);
        if (inner != null) return inner;
        const deep = deepScanRiskNumeric(nested, mode, depth + 1);
        if (deep != null) return deep;
      }
    }

    if (RISK_SUBKEY_RE.test(kl)) {
      const nested = parseMaybeObject(value);
      if (nested) {
        const deep = deepScanRiskNumeric(nested, mode, depth + 1);
        if (deep != null) return deep;
      }
    }
  }

  return undefined;
}

export function extractPositionRiskPrices(row: Record<string, unknown>): {
  stopLossPrice?: number;
  takeProfitPrice?: number;
} {
  const stopLossPrice =
    extractNumericCandidate(row, STOP_LOSS_ALIASES) ??
    extractFromNestedBlocks(row, NESTED_STOP_KEYS, [...TRIGGER_ALIASES, "stopPrice"]) ??
    deepScanRiskNumeric(row, "stop");

  const takeProfitPrice =
    extractNumericCandidate(row, TAKE_PROFIT_ALIASES) ??
    extractFromNestedBlocks(row, NESTED_TP_KEYS, [...TRIGGER_ALIASES, "stopPrice"]) ??
    deepScanRiskNumeric(row, "take");

  return {
    ...(stopLossPrice != null ? { stopLossPrice } : {}),
    ...(takeProfitPrice != null ? { takeProfitPrice } : {}),
  };
}

export function extractOrderRiskPrices(row: Record<string, unknown>): {
  triggerPrice?: number;
  stopPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
} {
  const nestedSl = extractFromNestedBlocks(row, NESTED_STOP_KEYS, TRIGGER_ALIASES);
  const nestedTp = extractFromNestedBlocks(row, NESTED_TP_KEYS, TRIGGER_ALIASES);

  const stopPrice =
    extractNumericCandidate(row, ["stopPrice", "stopLossPrice", ...STOP_LOSS_ALIASES]) ??
    nestedSl;

  const triggerPrice =
    extractNumericCandidate(row, TRIGGER_ALIASES) ?? stopPrice ?? nestedSl ?? nestedTp;

  const stopLossPrice = nestedSl ?? stopPrice;
  const takeProfitPrice =
    extractNumericCandidate(row, TAKE_PROFIT_ALIASES) ?? nestedTp;

  return {
    ...(triggerPrice != null ? { triggerPrice } : {}),
    ...(stopPrice != null ? { stopPrice } : {}),
    ...(stopLossPrice != null ? { stopLossPrice } : {}),
    ...(takeProfitPrice != null ? { takeProfitPrice } : {}),
  };
}

function collectMatchingFields(
  row: Record<string, unknown>,
  mode: "stop" | "take" | "trigger",
): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};

  const visit = (obj: Record<string, unknown>, prefix: string, depth: number) => {
    if (depth > 3) return;
    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const kl = key.toLowerCase();

      if (SKIP_VALUE_KEY_RE.test(kl) && !RISK_SUBKEY_RE.test(kl)) continue;

      const isStop = /stop|sl|loss/i.test(kl) && !/take|tp/i.test(kl);
      const isTake = /take|tp|profit/i.test(kl) && !/stop|sl/i.test(kl);
      const isTrigger = /trigger|activation|entrust|plan|tpsl/i.test(kl);

      const match =
        mode === "stop"
          ? isStop
          : mode === "take"
            ? isTake
            : isTrigger || isStop || isTake;

      if (!match) {
        const nested = parseMaybeObject(value);
        if (nested) visit(nested, path, depth + 1);
        continue;
      }

      if (typeof value === "number" || typeof value === "string") {
        out[path] = value;
      } else if (value == null) {
        out[path] = null;
      } else {
        const nested = parseMaybeObject(value);
        if (nested) visit(nested, path, depth + 1);
        else out[path] = "[object]";
      }
    }
  };

  visit(row, "", 0);
  return out;
}

export function scanRiskCandidateFields(row: Record<string, unknown>): {
  keys: string[];
  candidateStopFields: Record<string, number | string | null>;
  candidateTakeProfitFields: Record<string, number | string | null>;
  candidateTriggerFields: Record<string, number | string | null>;
} {
  return {
    keys: Object.keys(row),
    candidateStopFields: collectMatchingFields(row, "stop"),
    candidateTakeProfitFields: collectMatchingFields(row, "take"),
    candidateTriggerFields: collectMatchingFields(row, "trigger"),
  };
}

export function riskRelatedKeys(keys: string[]): string[] {
  return keys.filter((k) =>
    /stop|sl|take|tp|trigger|activation|plan|profit|loss|entrust|tpsl/i.test(k),
  );
}
