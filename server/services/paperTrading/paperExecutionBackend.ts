export { normalizePaperOrderBody } from "../paperExecutionAdapter";
import { paperExecutionAdapter } from "../paperExecutionAdapter";

export type PaperExecutionBackendId = "legacy" | "nautilus";

export type PaperExecutionBackendErrorCode =
  | "BACKEND_NOT_AVAILABLE"
  | "BACKEND_START_FAILED"
  | "BACKEND_REQUEST_FAILED";

export interface PaperExecutionBackendOptions {
  backendId?: PaperExecutionBackendId;
}

export interface PaperExecutionBackendNotAvailable {
  success: false;
  code: PaperExecutionBackendErrorCode;
  message: string;
}

function backendNotAvailable(): PaperExecutionBackendNotAvailable {
  return {
    success: false,
    code: "BACKEND_NOT_AVAILABLE",
    message: "Nautilus paper backend is not implemented in N3A.",
  };
}

function useLegacy(backendId: PaperExecutionBackendId | undefined): boolean {
  return backendId == null || backendId === "legacy";
}

type LegacyAdapter = typeof paperExecutionAdapter;
type AccountReturn = ReturnType<LegacyAdapter["getAccount"]>;
type OrdersReturn = ReturnType<LegacyAdapter["getOrders"]>;
type PositionsReturn = ReturnType<LegacyAdapter["getPositions"]>;
type PreviewReturn = ReturnType<LegacyAdapter["previewOrder"]>;
type SubmitReturn = ReturnType<LegacyAdapter["submitOrder"]>;
type CancelReturn = ReturnType<LegacyAdapter["cancelOrder"]>;
type CancelAllReturn = ReturnType<LegacyAdapter["cancelAllOrders"]>;
type CloseReturn = ReturnType<LegacyAdapter["closePosition"]>;

export const legacyPaperExecutionBackend = {
  id: "legacy" as const,
  async getAccount(userId: number): AccountReturn {
    return paperExecutionAdapter.getAccount(userId);
  },
  async getOrders(userId: number): OrdersReturn {
    return paperExecutionAdapter.getOrders(userId);
  },
  async getPositions(userId: number): PositionsReturn {
    return paperExecutionAdapter.getPositions(userId);
  },
  async previewOrder(userId: number, order: unknown): PreviewReturn {
    return paperExecutionAdapter.previewOrder(userId, order as never);
  },
  async submitOrder(userId: number, order: unknown): SubmitReturn {
    return paperExecutionAdapter.submitOrder(userId, order as never);
  },
  async cancelOrder(userId: number, orderId: string): CancelReturn {
    return paperExecutionAdapter.cancelOrder(userId, orderId);
  },
  async cancelAllOrders(userId: number): CancelAllReturn {
    return paperExecutionAdapter.cancelAllOrders(userId);
  },
  async closePosition(userId: number): CloseReturn {
    return paperExecutionAdapter.closePosition(userId);
  },
};

export const paperExecutionBackend = {
  id: "legacy" as const,
  async getAccount(userId: number, options: PaperExecutionBackendOptions = {}): Promise<AccountReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.getAccount(userId);
  },
  async getOrders(userId: number, options: PaperExecutionBackendOptions = {}): Promise<OrdersReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.getOrders(userId);
  },
  async getPositions(userId: number, options: PaperExecutionBackendOptions = {}): Promise<PositionsReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.getPositions(userId);
  },
  async previewOrder(userId: number, order: unknown, options: PaperExecutionBackendOptions = {}): Promise<PreviewReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.previewOrder(userId, order);
  },
  async submitOrder(userId: number, order: unknown, options: PaperExecutionBackendOptions = {}): Promise<SubmitReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.submitOrder(userId, order);
  },
  async cancelOrder(userId: number, orderId: string, options: PaperExecutionBackendOptions = {}): Promise<CancelReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.cancelOrder(userId, orderId);
  },
  async cancelAllOrders(userId: number, options: PaperExecutionBackendOptions = {}): Promise<CancelAllReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.cancelAllOrders(userId);
  },
  async closePosition(userId: number, options: PaperExecutionBackendOptions = {}): Promise<CloseReturn | PaperExecutionBackendNotAvailable> {
    if (!useLegacy(options.backendId)) return backendNotAvailable();
    return legacyPaperExecutionBackend.closePosition(userId);
  },
};
