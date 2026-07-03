const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_BASE = "https://open-api.bingx.com";

export interface BingXSymbolRules {
  symbol: string;
  minQty: number;
  maxQty: number;
  stepSize: number;
  quantityPrecision: number;
  pricePrecision: number;
  minNotional: number;
  contractSize?: number;
}

const rulesCache = new Map<string, { rules: BingXSymbolRules; expiresAt: number }>();

function getBaseUrl(): string {
  return (process.env.BINGX_API_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

/**
 * Fetch contract info from BingX public API (no auth required).
 * Endpoint: /openApi/swap/v2/trade/contractInfo
 */
async function fetchContractInfo(symbol: string): Promise<BingXSymbolRules> {
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/openApi/swap/v2/trade/contractInfo?symbol=${encodeURIComponent(symbol)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    const text = await res.text();
    const json = JSON.parse(text) as { code: number; msg?: string; data?: unknown };

    if (!res.ok || json.code !== 0) {
      console.warn("[bingx-symbol-rules] fetch failed", {
        symbol,
        endpoint: url,
        status: res.status,
        code: json.code,
        message: json.msg,
      });
      throw new Error(
        `BingX contract info failed: ${json.msg || `HTTP ${res.status}`}`
      );
    }

    return parseContractInfo(symbol, json.data);
  } catch (err) {
    console.warn("[bingx-symbol-rules] fetch error", {
      symbol,
      endpoint: url,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function parseContractInfo(symbol: string, data: unknown): BingXSymbolRules {
  if (data == null || typeof data !== "object") {
    console.warn("[bingx-symbol-rules] invalid response shape", {
      symbol,
      dataType: typeof data,
    });
    throw new Error("Invalid contract info response");
  }

  const obj = data as Record<string, unknown>;

  // Handle both array and single object responses
  const contract = Array.isArray(obj)
    ? obj.find((item: unknown) => typeof item === "object" && (item as Record<string, unknown>).symbol === symbol)
    : obj;

  if (!contract || typeof contract !== "object") {
    console.warn("[bingx-symbol-rules] contract not found", {
      symbol,
      isArray: Array.isArray(obj),
      arrayLength: Array.isArray(obj) ? obj.length : 0,
      responseShapeKeys: Object.keys(obj),
    });
    throw new Error(`Contract info not found for symbol ${symbol}`);
  }

  const c = contract as Record<string, unknown>;

  // Try multiple possible field names for min quantity
  const minQty =
    parseNumber(c.minQty, null) ??
    parseNumber(c.minTradeNum, null) ??
    parseNumber(c.minOrderQty, null) ??
    parseNumber(c.tradeMinQuantity, null) ??
    0.001;

  const maxQty = parseNumber(c.maxQty, 1000000) ?? 1000000;

  // Try stepSize first, then derive from quantityPrecision
  let stepSize = parseNumber(c.stepSize, null);
  const quantityPrecision = parseNumber(c.quantityPrecision, null) ?? parseNumber(c.sizePrecision, 3) ?? 3;

  if (stepSize == null || stepSize <= 0) {
    // Derive stepSize from quantityPrecision
    stepSize = Math.pow(10, -quantityPrecision);
    console.warn("[bingx-symbol-rules] derived stepSize from precision", {
      symbol,
      quantityPrecision,
      derivedStepSize: stepSize,
    });
  }

  const pricePrecision = parseNumber(c.pricePrecision, 2) ?? 2;
  const minNotional = parseNumber(c.minNotional, 5) ?? 5;
  const contractSize = parseNumber(c.contractSize, undefined) ?? undefined;

  console.warn("[bingx-symbol-rules] parsed successfully", {
    symbol,
    minQty,
    maxQty,
    stepSize,
    quantityPrecision,
    pricePrecision,
    minNotional,
    contractSize,
  });

  return {
    symbol,
    minQty,
    maxQty,
    stepSize,
    quantityPrecision,
    pricePrecision,
    minNotional,
    contractSize,
  };
}

function parseNumber(value: unknown, fallback: number | null | undefined): number | null {
  if (value == null) {
    if (fallback === undefined || fallback === null) {
      return null;
    }
    return fallback;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    if (fallback === undefined || fallback === null) {
      return null;
    }
    return fallback;
  }
  return n;
}

/**
 * Get symbol rules with caching.
 */
export async function getBingXSymbolRules(symbol: string): Promise<BingXSymbolRules> {
  const normalizedSymbol = symbol.trim().toUpperCase().replace(/\s+/g, "");
  
  const cached = rulesCache.get(normalizedSymbol);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rules;
  }

  const rules = await fetchContractInfo(normalizedSymbol);
  rulesCache.set(normalizedSymbol, {
    rules,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return rules;
}

/**
 * Normalize quantity according to step size and precision.
 * Floors to the nearest step size.
 */
export function normalizeQuantity(
  rawQty: number,
  stepSize: number,
  quantityPrecision: number,
): number {
  if (!Number.isFinite(rawQty) || rawQty <= 0) {
    throw new Error("Invalid raw quantity");
  }
  if (!Number.isFinite(stepSize) || stepSize <= 0) {
    throw new Error("Invalid step size");
  }

  // Floor to step size
  const steps = Math.floor(rawQty / stepSize);
  const normalized = steps * stepSize;

  // Round to precision
  const multiplier = Math.pow(10, quantityPrecision);
  return Math.round(normalized * multiplier) / multiplier;
}

/**
 * Format quantity for BingX API (string with correct precision, no scientific notation).
 */
export function formatQuantityForBingX(quantity: number, precision: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Invalid quantity for formatting");
  }

  const multiplier = Math.pow(10, precision);
  const rounded = Math.round(quantity * multiplier) / multiplier;

  // Use toFixed to avoid scientific notation, then remove trailing zeros
  return rounded.toFixed(precision).replace(/\.?0+$/, "");
}

/**
 * Fallback quantity formatter for when symbol rules are unavailable.
 * Used in test mode to format quantity safely without precision info.
 */
export function formatQuantityFallback(quantity: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Invalid quantity for fallback formatting");
  }

  // Use up to 6 decimal places for BTC-like assets
  const precision = 6;
  const multiplier = Math.pow(10, precision);
  const rounded = Math.round(quantity * multiplier) / multiplier;

  // Use toFixed to avoid scientific notation, then remove trailing zeros
  return rounded.toFixed(precision).replace(/\.?0+$/, "");
}

/**
 * Validate quantity against symbol rules.
 * Returns { valid: boolean, error?: string, normalizedQty?: number, requiredMinNotional?: number }
 */
export function validateQuantityAgainstRules(
  rawQty: number,
  entryPrice: number,
  rules: BingXSymbolRules,
): {
  valid: boolean;
  error?: string;
  normalizedQty?: number;
  requiredMinNotional?: number;
} {
  if (!Number.isFinite(rawQty) || rawQty <= 0) {
    return { valid: false, error: "Invalid quantity" };
  }

  if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
    return { valid: false, error: "Invalid entry price" };
  }

  // Normalize quantity (floor to step — authoritative for submit)
  let normalizedQty: number;
  try {
    normalizedQty = normalizeQuantity(rawQty, rules.stepSize, rules.quantityPrecision);
  } catch {
    return { valid: false, error: "Failed to normalize quantity" };
  }

  if (normalizedQty <= 0) {
    return {
      valid: false,
      error: `Order quantity below BingX minimum step size (${rules.stepSize})`,
      requiredMinNotional: rules.minNotional,
    };
  }

  const notional = normalizedQty * entryPrice;

  // Minimum notional on normalized order (notional = normalizedQty × effectivePrice)
  if (notional < rules.minNotional) {
    return {
      valid: false,
      error: `Order notional below BingX minimum. Min notional: ${rules.minNotional} USDT`,
      normalizedQty,
      requiredMinNotional: rules.minNotional,
    };
  }

  if (normalizedQty < rules.minQty) {
    const requiredMinNotional = rules.minQty * entryPrice;
    return {
      valid: false,
      error: `Order quantity below BingX minimum. Min qty: ${rules.minQty}. Required notional approx: ${requiredMinNotional.toFixed(2)} USDT`,
      normalizedQty,
      requiredMinNotional: Math.max(rules.minNotional, requiredMinNotional),
    };
  }

  if (normalizedQty > rules.maxQty) {
    return {
      valid: false,
      error: `Order quantity exceeds BingX maximum. Max qty: ${rules.maxQty}`,
      normalizedQty,
    };
  }

  return { valid: true, normalizedQty };
}

/**
 * Clear cache (useful for testing or force refresh).
 */
export function clearSymbolRulesCache(): void {
  rulesCache.clear();
}
