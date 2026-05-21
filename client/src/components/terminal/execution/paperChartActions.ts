/** Shared paper API helpers for chart + execution panel */

import { paperApiFetch } from "../execution/paperApiClient";

export async function postPaperClosePartial(percent: number): Promise<{
  success: boolean;
  message?: string;
  code?: string;
}> {
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
