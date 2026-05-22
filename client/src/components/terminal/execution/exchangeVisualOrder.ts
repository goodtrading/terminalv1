import type { ExchangeConnectionState } from "./executionTypes";

/** Absolute render order — ignores connection/active/status. */
export const EXCHANGE_PANEL_SLOT_ORDER = ["paper", "bingx", "binance"] as const;

export type ExchangePanelSlotId = (typeof EXCHANGE_PANEL_SLOT_ORDER)[number];

export function normalizeExchangeKey(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]/g, "");
}

/** Fallback priority when slot id is unknown (sort only). */
export function getExchangeVisualPriority(exchange: {
  id?: string;
  name?: string;
  title?: string;
  label?: string;
  exchange?: string;
  broker?: string;
  provider?: string;
  type?: string;
}): number {
  const raw = [
    exchange.id,
    exchange.name,
    exchange.title,
    exchange.label,
    exchange.exchange,
    exchange.broker,
    exchange.provider,
    exchange.type,
  ]
    .filter(Boolean)
    .join(" ");

  const key = normalizeExchangeKey(raw);

  if (
    key.includes("goodtrading") ||
    key.includes("papertrading") ||
    (key.includes("paper") && key.includes("trading"))
  ) {
    return 1;
  }
  if (key.includes("bingx")) return 2;
  if (key.includes("binance")) return 3;

  return 99;
}

function slotIdFromExchange(exchange: {
  id?: string;
  name?: string;
}): ExchangePanelSlotId | null {
  const idKey = normalizeExchangeKey(exchange.id);
  if (idKey === "paper" || idKey === "bingx" || idKey === "binance") {
    return idKey as ExchangePanelSlotId;
  }

  const priority = getExchangeVisualPriority(exchange);
  if (priority === 1) return "paper";
  if (priority === 2) return "bingx";
  if (priority === 3) return "binance";
  return null;
}

/**
 * Builds final panel list in fixed slot order (Paper → BingX → Binance).
 * Dominates any prior array order or connection state.
 */
export function buildExchangePanelRenderOrder(
  exchanges: ExchangeConnectionState[],
): ExchangeConnectionState[] {
  const bySlot = new Map<ExchangePanelSlotId, ExchangeConnectionState>();

  for (const ex of exchanges) {
    const slot = slotIdFromExchange(ex);
    if (slot && !bySlot.has(slot)) {
      bySlot.set(slot, ex);
    }
  }

  return EXCHANGE_PANEL_SLOT_ORDER.map((slot) => bySlot.get(slot)).filter(
    (ex): ex is ExchangeConnectionState => ex != null,
  );
}

/** @deprecated Use buildExchangePanelRenderOrder for panel render */
export function sortExchangeConnectionStates(
  exchanges: ExchangeConnectionState[],
): ExchangeConnectionState[] {
  return buildExchangePanelRenderOrder(exchanges);
}
