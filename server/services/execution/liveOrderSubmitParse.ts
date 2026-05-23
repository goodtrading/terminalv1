import type { LiveOrderSubmitRequest } from "./liveOrderSubmitTypes";

export function parseLiveOrderSubmitBody(
  body: Record<string, unknown> | undefined,
):
  | { ok: true; data: LiveOrderSubmitRequest }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Request body is required." };
  }

  if (body.type === "market") {
    return {
      ok: false,
      message:
        "Live market orders are disabled in this phase. Use limit orders only.",
    };
  }

  const exchange = body.exchange === "bingx" ? "bingx" : null;
  if (!exchange) {
    return { ok: false, message: 'exchange must be "bingx".' };
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  if (!symbol) return { ok: false, message: "symbol is required." };

  const side = body.side === "buy" || body.side === "sell" ? body.side : null;
  if (!side) return { ok: false, message: 'side must be "buy" or "sell".' };

  if (body.type != null && body.type !== "limit") {
    return {
      ok: false,
      message: 'type must be "limit" for live submit.',
    };
  }

  const num = (k: string) => {
    const v = body[k];
    if (v == null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const limitPrice = num("limitPrice");
  if (limitPrice == null || limitPrice <= 0) {
    return { ok: false, message: "limitPrice is required and must be > 0." };
  }

  const stopLossPrice = num("stopLossPrice");
  if (stopLossPrice == null || stopLossPrice <= 0) {
    return { ok: false, message: "stopLossPrice is required for live orders." };
  }

  const confirmationText =
    typeof body.confirmationText === "string" ? body.confirmationText : "";
  if (!confirmationText.trim()) {
    return { ok: false, message: "confirmationText is required." };
  }

  const leverageRaw = num("leverage");
  if (leverageRaw != null && leverageRaw <= 0) {
    return { ok: false, message: "leverage must be > 0." };
  }

  const previewId =
    typeof body.previewId === "string" && body.previewId.trim()
      ? body.previewId.trim()
      : undefined;

  const sizingMode = body.sizingMode === "margin" || body.sizingMode === "notional" ? body.sizingMode : undefined;

  return {
    ok: true,
    data: {
      exchange: "bingx",
      symbol,
      side,
      type: "limit",
      quantity: num("quantity"),
      notionalUsdt: num("notionalUsdt"),
      marginUsdt: num("marginUsdt"),
      sizingMode,
      limitPrice,
      stopLossPrice,
      takeProfitPrice: num("takeProfitPrice"),
      leverage: leverageRaw,
      reduceOnly: body.reduceOnly === true,
      confirmationText,
      previewId,
    },
  };
}
