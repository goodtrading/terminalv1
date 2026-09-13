export type ProtectiveDragTerminal = "IDLE" | "DRAGGING" | "COMMITTED" | "ABORTED";

export function createProtectiveDragState() {
  let state: ProtectiveDragTerminal = "IDLE";
  let originalPrice: number | null = null;
  let previewPrice: number | null = null;

  return {
    start(price: number) {
      if (state === "DRAGGING") return false;
      state = "DRAGGING";
      originalPrice = price;
      previewPrice = price;
      return true;
    },
    preview(price: number) {
      if (state !== "DRAGGING") return false;
      previewPrice = price;
      return true;
    },
    abort() {
      if (state !== "DRAGGING") return false;
      state = "ABORTED";
      previewPrice = originalPrice;
      return true;
    },
    commit(price: number) {
      if (state !== "DRAGGING") return null;
      state = "COMMITTED";
      previewPrice = price;
      return price;
    },
    getState: () => state,
    getOriginalPrice: () => originalPrice,
    getPreviewPrice: () => previewPrice,
  };
}
