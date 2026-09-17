import { gunzipSync } from "node:zlib";

export const BINGX_SWAP_MARKET_WS_URL = "wss://open-api-swap.bingx.com/swap-market";
export const BINGX_BOOK_TICKER_SUBSCRIPTION = "BTC-USDT@bookTicker";

export type BingXBookTickerBboEvent = Readonly<{
  canonicalMarket: Readonly<{ venue: "BINGX"; marketType: "Perpetual"; symbol: "BTC-USDT" }>;
  venue: "BINGX";
  product: "Perpetual";
  nativeSymbol: "BTC-USDT";
  marketSource: "BINGX_BOOK_TICKER";
  marketSourceTimestampMs: number;
  observedAt: Date;
  sourceAgeAtObservationMs: number;
  sourceAgeDiagnostic: "SOURCE_TIMESTAMP_AFTER_OBSERVED_AT" | null;
  bestBid: string;
  bestAsk: string;
  bestBidQuantity: string;
  bestAskQuantity: string;
  providerSequence: string | null;
  provenance: Readonly<{ source: "BINGX_PUBLIC_WS"; endpoint: string; subscription: "BTC-USDT@bookTicker" }>;
}>;

type ParseErrorCode = "MALFORMED_JSON" | "INVALID_PAYLOAD" | "WRONG_SYMBOL" | "INVALID_DECIMAL" | "INVALID_PRICE" | "CROSSED_BBO";
export type BingXBookTickerParseResult = { ok: true; event: BingXBookTickerBboEvent } | { ok: false; code: ParseErrorCode; message: string };
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const asRecord = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" ? value as Record<string, unknown> : null;

export function parseBingXBookTickerMessage(raw: string | Uint8Array, observedAt: Date): BingXBookTickerParseResult {
  let decoded: string;
  try {
    const bytes = typeof raw === "string" ? Buffer.from(raw) : Buffer.from(raw);
    try { decoded = gunzipSync(bytes).toString("utf8"); } catch { decoded = bytes.toString("utf8"); }
    const root = asRecord(JSON.parse(decoded)); const data = asRecord(root?.data);
    if (!data || !("s" in data) || !("b" in data) || !("B" in data) || !("a" in data) || !("A" in data) || !("T" in data)) return { ok: false, code: "INVALID_PAYLOAD", message: "bookTicker requires s, b, B, a, A, and T" };
    if (data.s !== "BTC-USDT") return { ok: false, code: "WRONG_SYMBOL", message: "only canonical BTC-USDT is accepted" };
    const fields = [data.b, data.a, data.B, data.A];
    if (fields.some((v) => typeof v !== "string" || !DECIMAL.test(v))) return { ok: false, code: "INVALID_DECIMAL", message: "bookTicker prices and quantities must be decimal strings" };
    if (typeof data.T !== "number" || !Number.isSafeInteger(data.T) || data.T <= 0) return { ok: false, code: "INVALID_PAYLOAD", message: "T must be a positive integer millisecond timestamp" };
    const providerSequence = data.u === undefined || data.u === null ? null : typeof data.u === "number" && Number.isSafeInteger(data.u) ? String(data.u) : typeof data.u === "string" && /^[0-9]+$/.test(data.u) ? data.u : null;
    const bid = fields[0] as string, ask = fields[1] as string, bidQty = fields[2] as string, askQty = fields[3] as string;
    if (!isPositive(bid) || !isPositive(ask) || !isNonnegative(bidQty) || !isNonnegative(askQty)) return { ok: false, code: "INVALID_PRICE", message: "prices must be positive and quantities nonnegative" };
    if (compareDecimal(bid, ask) > 0) return { ok: false, code: "CROSSED_BBO", message: "bid exceeds ask" };
    const age = observedAt.getTime() - data.T;
    return { ok: true, event: { canonicalMarket: { venue: "BINGX", marketType: "Perpetual", symbol: "BTC-USDT" }, venue: "BINGX", product: "Perpetual", nativeSymbol: "BTC-USDT", marketSource: "BINGX_BOOK_TICKER", marketSourceTimestampMs: data.T, observedAt, sourceAgeAtObservationMs: age, sourceAgeDiagnostic: age < 0 ? "SOURCE_TIMESTAMP_AFTER_OBSERVED_AT" : null, bestBid: bid, bestAsk: ask, bestBidQuantity: bidQty, bestAskQuantity: askQty, providerSequence, provenance: { source: "BINGX_PUBLIC_WS", endpoint: BINGX_SWAP_MARKET_WS_URL, subscription: BINGX_BOOK_TICKER_SUBSCRIPTION } } };
  } catch (error) { return { ok: false, code: "MALFORMED_JSON", message: error instanceof Error ? error.message : "malformed JSON" }; }
}
function isPositive(s: string): boolean { return s !== "0" && !s.startsWith("-" ); }
function isNonnegative(s: string): boolean { return !s.startsWith("-"); }
function compareDecimal(a: string, b: string): number { const [ai, af = ""] = a.split("."), [bi, bf = ""] = b.split("."); const aa = ai.replace(/^0+(?=\d)/, ""), bb = bi.replace(/^0+(?=\d)/, ""); if (aa.length !== bb.length) return aa.length > bb.length ? 1 : -1; if (aa !== bb) return aa > bb ? 1 : -1; const n = Math.max(af.length, bf.length); return af.padEnd(n, "0") === bf.padEnd(n, "0") ? 0 : af.padEnd(n, "0") > bf.padEnd(n, "0") ? 1 : -1; }

export function decodeBingXPublicMessage(raw: string | Uint8Array): string { const bytes = Buffer.from(raw); try { return gunzipSync(bytes).toString("utf8"); } catch { return bytes.toString("utf8"); } }
