import { randomUUID } from "node:crypto";
import type { BingXBookTickerBboEvent } from "./bingxBookTicker";

export type DurableBingXBboEvent = BingXBookTickerBboEvent & Readonly<{ id: string }>;
export type BingXBboValidationError = "INVALID_MARKET_IDENTITY" | "INVALID_SOURCE" | "INVALID_DECIMAL" | "INVALID_VALUE" | "INVALID_TIMESTAMP" | "INVALID_OBSERVED_AT";
export type BingXBboValidationResult = { ok: true; event: DurableBingXBboEvent } | { ok: false; code: BingXBboValidationError; message: string };
const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const record = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === "object" ? v as Record<string, unknown> : null;
function validPositive(v: string): boolean { return v !== "0" && !v.startsWith("-"); }
function validNonnegative(v: string): boolean { return !v.startsWith("-"); }
function compare(a: string, b: string): number { const [ai, af=""] = a.split("."), [bi,bf=""] = b.split("."); const aa=ai.replace(/^0+(?=\d)/, ""),bb=bi.replace(/^0+(?=\d)/, ""); if(aa.length!==bb.length)return aa.length>bb.length?1:-1;if(aa!==bb)return aa>bb?1:-1;const n=Math.max(af.length,bf.length),x=af.padEnd(n,"0"),y=bf.padEnd(n,"0");return x===y?0:x>y?1:-1; }
export function validateDurableBingXBboEvent(input: BingXBookTickerBboEvent): BingXBboValidationResult {
  const v = record(input); if (!v || v.venue !== "BINGX" || v.product !== "Perpetual" || v.nativeSymbol !== "BTC-USDT" || record(v.canonicalMarket)?.venue !== "BINGX" || record(v.canonicalMarket)?.marketType !== "Perpetual" || record(v.canonicalMarket)?.symbol !== "BTC-USDT") return { ok:false, code:"INVALID_MARKET_IDENTITY", message:"only canonical BingX BTC-USDT Perpetual is accepted" };
  if (v.marketSource !== "BINGX_BOOK_TICKER") return { ok:false, code:"INVALID_SOURCE", message:"source must be BingX bookTicker" };
  const values=[v.bestBid,v.bestAsk,v.bestBidQuantity,v.bestAskQuantity]; if(values.some(x=>typeof x!=="string"||!DECIMAL.test(x as string)))return{ok:false,code:"INVALID_DECIMAL",message:"BBO values must be exact decimal strings"};
  const [bestBid,bestAsk,bestBidQuantity,bestAskQuantity]=values as [string,string,string,string];
  if(!validPositive(bestBid)||!validPositive(bestAsk)||!validNonnegative(bestBidQuantity)||!validNonnegative(bestAskQuantity)||compare(bestBid,bestAsk)>0)return{ok:false,code:"INVALID_VALUE",message:"BBO values are invalid or crossed"};
  if(typeof v.marketSourceTimestampMs!=="number"||!Number.isSafeInteger(v.marketSourceTimestampMs)||v.marketSourceTimestampMs<=0)return{ok:false,code:"INVALID_TIMESTAMP",message:"source timestamp must be a positive millisecond integer"};
  if(!(v.observedAt instanceof Date)||Number.isNaN(v.observedAt.getTime()))return{ok:false,code:"INVALID_OBSERVED_AT",message:"observedAt must be a valid Date"};
  return {ok:true,event:{...input,id:randomUUID()}};
}
