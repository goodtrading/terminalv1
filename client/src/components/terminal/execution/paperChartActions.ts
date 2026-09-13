/** Shared paper API helpers for chart + execution panel */

import { paperApiFetch } from "../execution/paperApiClient";
import { getPaperExecutionBackend, paperExecutionPort } from "@/lib/paperExecutionPort";

function decimalParts(value: number): { digits: bigint; scale: bigint } {
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("Invalid decimal quantity");
  const [whole, fraction = ""] = text.split(".");
  return { digits: BigInt(`${whole}${fraction}`), scale: 10n ** BigInt(fraction.length) };
}

export const NAUTILUS_PAPER_QUANTITY_INCREMENT_TEXT = "0.001";

function decimalTextParts(value: string): { digits: bigint; scale: bigint } {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("Invalid decimal quantity");
  const [whole, fraction = ""] = normalized.split(".");
  return { digits: BigInt(`${whole}${fraction}`), scale: 10n ** BigInt(fraction.length) };
}

export function isExecutableNautilusCloseQuantity(quantityText: string, incrementText = NAUTILUS_PAPER_QUANTITY_INCREMENT_TEXT): boolean {
  try {
    const quantity = decimalTextParts(quantityText);
    const increment = decimalTextParts(incrementText);
    return quantity.digits > 0n && (quantity.digits * increment.scale) % (increment.digits * quantity.scale) === 0n;
  } catch {
    return false;
  }
}

export function closeQuantityText(quantity: number, percent: number): string {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(percent) || percent <= 0 || percent > 100) {
    throw new Error("Invalid close quantity");
  }
  const q = decimalParts(quantity);
  const p = decimalParts(percent);
  const numerator = q.digits * p.digits;
  const denominator = q.scale * p.scale * 100n;
  const whole = numerator / denominator;
  let remainder = numerator % denominator;
  if (remainder === 0n) return String(whole);
  let fraction = "";
  while (remainder !== 0n && fraction.length < 24) {
    remainder *= 10n;
    fraction += (remainder / denominator).toString();
    remainder %= denominator;
  }
  fraction = fraction.replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export function assertFilledPaperCloseOrder(order: { status?: string; quantity?: string; side?: string }): void {
  if (order.status?.toUpperCase() !== "FILLED") {
    const status = order.status?.trim() || "UNKNOWN";
    throw new Error(`Paper close order was not filled (status: ${status})`);
  }
}

export async function postPaperClosePartial(percent: number, quantity?: string): Promise<{
  success: boolean;
  message?: string;
  code?: string;
}> {
  if (getPaperExecutionBackend() === "nautilus") {
    const order = await paperExecutionPort.closePosition({
      instrument: { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP", baseAsset: "BTC", quoteAsset: "USDT", exchangeNativeSymbol: "BTCUSDT" },
      ...(quantity ? { quantity } : {}),
    });
    assertFilledPaperCloseOrder(order);
    return { success: true, message: order.reason ?? "Paper position close submitted" };
  }
  const res = await paperApiFetch("/api/paper/position/close-partial", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ percent }),
  });
  const data = (await res.json()) as {
    success?: boolean;
    message?: string;
    code?: string;
  };
  if (!res.ok || !data.success) {
    throw new Error(data.message ?? "Close failed");
  }
  return data as { success: boolean; message?: string };
}

export async function postPaperCancelOrder(orderId: string): Promise<void> {
  const res = await paperApiFetch(
    `/api/paper/orders/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST" },
  );
  const data = (await res.json()) as { success?: boolean; message?: string };
  if (!res.ok || data.success === false) {
    throw new Error(data.message ?? "Cancel failed");
  }
}

export async function patchPaperOrderPrice(
  orderId: string,
  price: number,
): Promise<void> {
  const res = await paperApiFetch(`/api/paper/orders/${encodeURIComponent(orderId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price }),
  });
  const data = (await res.json()) as { success?: boolean; message?: string };
  if (!res.ok || !data.success) {
    throw new Error(data.message ?? "Order update failed");
  }
}
