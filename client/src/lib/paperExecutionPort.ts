import { isDesktopApp } from "./desktopRuntime";
import { assertPaperOwnerCurrent, capturePaperOwner } from "./paperOwnerContext";
import {
  PAPER_EXECUTION_STATE_CHANGED_EVENT,
  getPaperExecutionBackend as getSelectedPaperExecutionBackend,
  notifyPaperExecutionBackendChange,
  setPaperExecutionBackend as setSelectedPaperExecutionBackend,
} from "./paperExecutionBackendState";
import {
  paperApiFetch as legacyPaperApiFetch,
  paperApiJson as legacyPaperApiJson,
} from "../components/terminal/execution/paperApiClient";
import type {
  PaperAccountSnapshot,
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradingSettings,
  PaperFillSnapshot,
} from "../components/terminal/execution/executionTypes";
import {
  nautilusSimulation,
  type NautilusSimulationAccountWire,
  type NautilusSimulationOrderStateWire,
  type NautilusSimulationPositionWire,
  type NautilusSimulationFillWire,
} from "./nautilusSimulationBridge";
import { paperMarketSnapshotProvider } from "./paperMarketSnapshotProvider";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "../../../shared/execution/defaultExecutionContext";
import {
  createNautilusPaperMarketAdapter,
  NAUTILUS_PAPER_SIMULATION_CONTEXT,
  NautilusPaperMarketAdapterError,
  type NautilusPaperBackendState,
  type NautilusPaperMarketAdapterContext,
  type NautilusPaperMarketOrderIntent,
} from "./nautilusPaperMarketAdapter";
import {
  EXPECTED_NAUTILUS_VERSION,
  nautilusEngine,
  type NautilusEngineBridge,
  type NautilusEnginePingWire,
  type NautilusEngineStatusWire,
  type NautilusEngineVersionWire,
} from "./nautilusEngineBridge";

export type PaperExecutionBackend = "legacy" | "nautilus";
export type PaperExecutionAvailability = "AVAILABLE" | "UNAVAILABLE" | "DEGRADED";
export type PaperExecutionEngineState = "STOPPED" | "RUNNING" | "UNKNOWN";
export type PaperExecutionSimulationState = "STOPPED" | "RUNNING" | "UNKNOWN";

export type PaperExecutionBackendCode =
  | "BACKEND_NOT_AVAILABLE"
  | "DESKTOP_ONLY"
  | "NAUTILUS_ORDER_PATH_NOT_ENABLED"
  | "NOT_ENABLED_IN_N3D1"
  | "LEGACY_HTTP_FAILED"
  | "NAUTILUS_BACKEND_NOT_READY"
  | "UNSUPPORTED_NAUTILUS_PAPER_CONTEXT"
  | "ORDER_TYPE_NOT_ENABLED"
  | "MARKET_SOURCE_MISMATCH"
  | "SNAPSHOT_STALE_BEFORE_SUBMIT"
  | "MARKET_ORDER_NOT_FILLED"
  | "ORDER_EXECUTED_STATE_REFRESH_FAILED"
  | "PREVIEW_NOT_ENABLED_FOR_NAUTILUS"
  | "NAUTILUS_DECIMAL_QUANTITY_REQUIRED";

export class PaperExecutionPortError extends Error {
  readonly code: PaperExecutionBackendCode;
  readonly details?: unknown;

  constructor(code: PaperExecutionBackendCode, message: string, details?: unknown) {
    super(message);
    this.name = "PaperExecutionPortError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  override toJSON(): PaperExecutionPortError {
    return this;
  }
}

type PaperExecutionPortLegacyTransport = {
  fetch: typeof legacyPaperApiFetch;
  json: typeof legacyPaperApiJson;
};

type PaperExecutionPortRuntime = {
  isDesktopApp: () => boolean;
};

export type PaperExecutionPortState = {
  backend: PaperExecutionBackend;
  availability: PaperExecutionAvailability;
  engine: PaperExecutionEngineState;
  simulation: PaperExecutionSimulationState;
  message?: string;
  error?: PaperExecutionPortError;
};

function finiteNumber(value: string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw buildError("BACKEND_NOT_AVAILABLE", `Nautilus ${field} is not a finite decimal.`, { field, value });
  }
  return parsed;
}

function mapNautilusAccount(account: NautilusSimulationAccountWire): PaperAccountSnapshot {
  return {
    exchange: "paper",
    balanceUsdt: finiteNumber(account.balance, "account.balance"),
    availableMarginUsdt: finiteNumber(account.availableBalance, "account.availableBalance"),
    unrealizedPnlUsdt: finiteNumber(account.unrealizedPnl, "account.unrealizedPnl"),
    realizedPnlUsdt: finiteNumber(account.realizedPnl, "account.realizedPnl"),
    equityUsdt: finiteNumber(account.equity, "account.equity"),
    feesTotal: account.feesTotal,
    updatedAt: new Date(account.timestamp).toISOString(),
  };
}

function mapNautilusPosition(position: NautilusSimulationPositionWire): PaperPositionSnapshot {
  return {
    symbol: position.instrument.symbol,
    side: position.side === "LONG" ? "long" : position.side === "SHORT" ? "short" : "flat",
    quantity: finiteNumber(position.quantity, "position.quantity"),
    entryPrice: position.averageEntryPrice === undefined ? null : finiteNumber(position.averageEntryPrice, "position.averageEntryPrice"),
    markPrice: position.markPrice === undefined ? null : finiteNumber(position.markPrice, "position.markPrice"),
    unrealizedPnl: finiteNumber(position.unrealizedPnl, "position.unrealizedPnl"),
    realizedPnl: finiteNumber(position.realizedPnl, "position.realizedPnl"),
    leverage: null,
    marginMode: "unknown",
  };
}

function mapNautilusOrder(order: NautilusSimulationOrderStateWire): PaperOrderSnapshot {
  const decimal = (value: string | undefined, field: string): number | undefined =>
    value === undefined ? undefined : finiteNumber(value, field);
  const quantity = decimal(order.quantity, "order.quantity") ?? 0;
  const limitPrice = decimal(order.price, "order.price");
  const triggerPrice = decimal(order.triggerPrice, "order.triggerPrice");
  return {
    id: order.clientOrderId,
    symbol: order.instrument.symbol,
    side: order.side === "BUY" ? "long" : "short",
    type: order.orderType === "LIMIT" ? "limit" : order.orderType === "STOP_MARKET" ? "stop_market" : "market",
    price: limitPrice ?? triggerPrice ?? null,
    size: quantity,
    sizeUnit: "BTC",
    leverage: 0,
    marginMode: "isolated",
    status: order.status,
    createdAt: new Date(order.timestamps.createdAt ?? Date.now()).toISOString(),
    venueOrderId: order.venueOrderId,
    instrument: order.instrument.symbol,
    orderType: order.orderType,
    quantity: order.quantity,
    filledQuantity: order.filledQuantity,
    remainingQuantity: order.remainingQuantity,
    limitPrice,
    triggerPrice,
    protectionType: order.protectionType,
    averageFillPrice: decimal(order.averageFillPrice, "order.averageFillPrice"),
    reason: order.reason,
  };
}

function mapNautilusFill(fill: NautilusSimulationFillWire): PaperFillSnapshot {
  const decimal = (value: string, field: string): number => finiteNumber(value, field);
  return {
    fillId: fill.fillId,
    clientOrderId: fill.clientOrderId,
    venueOrderId: fill.venueOrderId,
    instrument: fill.instrument.symbol,
    venue: fill.instrument.venue,
    marketType: fill.instrument.marketType,
    side: fill.side === "BUY" ? "buy" : "sell",
    price: decimal(fill.price, "fill.price"),
    quantity: decimal(fill.quantity, "fill.quantity"),
    timestamp: new Date(fill.timestamp).toISOString(),
    fee: fill.fee === undefined ? null : decimal(fill.fee, "fill.fee"),
    feeAsset: fill.feeAsset ?? null,
    liquidity: fill.liquidity === "MAKER" || fill.liquidity === "TAKER" ? fill.liquidity : null,
  };
}

export type NautilusDesktopPaperActivationResult = PaperExecutionPortState;
export type NautilusDesktopPaperDeactivationResult = PaperExecutionPortState;

type NautilusActivationStage =
  | "engine.start"
  | "engine.status"
  | "engine.version"
  | "engine.ping"
  | "simulation.start"
  | "simulation.status";

class NautilusActivationStageError extends Error {
  constructor(
    readonly activationStage: NautilusActivationStage,
    readonly elapsedMs: number,
    readonly originalError: unknown,
  ) {
    super(`Nautilus activation failed at ${activationStage}`);
    this.name = "NautilusActivationStageError";
  }
}

export type PaperExecutionPortDependencies = {
  legacy?: Partial<PaperExecutionPortLegacyTransport>;
  runtime?: PaperExecutionPortRuntime;
  engine?: NautilusEngineBridge;
  simulation?: typeof nautilusSimulation;
  marketSnapshotProvider?: typeof paperMarketSnapshotProvider;
  nowMs?: () => number;
  clientOrderIdFactory?: () => string;
  fetch?: typeof fetch;
};

export type PaperExecutionPortOrderRequest = {
  symbol: string;
  chartSymbol?: string;
  side: "buy" | "sell";
  orderType: "market" | "limit";
  notionalUSDT: number;
  qtyBTC: number;
  qty?: number;
  entryPrice: number | null;
  leverage: number;
  marginMode: "isolated" | "cross";
  stopLoss?: number | null;
  takeProfit?: number | null;
  reduceOnly?: boolean;
  price?: number | null;
  quantityText?: string;
  clientOrderId?: string;
  executionContext?: NautilusPaperMarketAdapterContext;
};

export type PaperExecutionPortOrderResult = {
  success: boolean;
  data?: unknown;
  message?: string;
  code?: string;
};

export type PaperOrderAmendRequest = {
  clientOrderId: string;
  limitPrice?: number;
  triggerPrice?: number;
};

export type PaperOrderAmendResult = {
  operation: "CANCEL_REPLACE";
  originalOrder: PaperOrderSnapshot;
  replacementOrder: PaperOrderSnapshot;
};

export type PaperProtectiveOrderRequest = {
  clientOrderId: string;
  protectionType: "STOP_LOSS" | "TAKE_PROFIT";
  price: number;
  quantity: string;
};

type PaperExecutionPortContext = {
  legacy: PaperExecutionPortLegacyTransport;
  runtime: PaperExecutionPortRuntime;
  engine: NautilusEngineBridge;
  simulation: typeof nautilusSimulation;
};

const DEFAULT_STATE: PaperExecutionPortState = {
  backend: "legacy",
  availability: "AVAILABLE",
  engine: "UNKNOWN",
  simulation: "UNKNOWN",
};

let portState: PaperExecutionPortState = { ...DEFAULT_STATE };
export { PAPER_EXECUTION_STATE_CHANGED_EVENT };

function notifyStateChange(): void {
  notifyPaperExecutionBackendChange();
}

function cloneState(): PaperExecutionPortState {
  return { ...portState };
}

function setState(next: PaperExecutionPortState): PaperExecutionPortState {
  portState = { ...next };
  notifyStateChange();
  return cloneState();
}

function buildError(
  code: PaperExecutionBackendCode,
  message: string,
  details?: unknown,
): PaperExecutionPortError {
  return new PaperExecutionPortError(code, message, details);
}

function logNautilusActivationStage(
  stage: NautilusActivationStage,
  phase: "start" | "ok" | "error",
  details: Record<string, unknown>,
): void {
  if (import.meta.env?.DEV) {
    console.info("[NAUTILUS ACTIVATE]", { stage, phase, ...details });
  }
}

async function runNautilusActivationStage<T>(
  stage: NautilusActivationStage,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logNautilusActivationStage(stage, "start", { startedAt });
  try {
    const result = await operation();
    logNautilusActivationStage(stage, "ok", {
      elapsedMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    logNautilusActivationStage(stage, "error", {
      elapsedMs,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new NautilusActivationStageError(stage, elapsedMs, error);
  }
}

function backendUnavailableState(message: string, error: PaperExecutionPortError): PaperExecutionPortState {
  return {
    backend: getSelectedPaperExecutionBackend(),
    availability: "UNAVAILABLE",
    engine: getSelectedPaperExecutionBackend() === "nautilus" ? portState.engine : "UNKNOWN",
    simulation: getSelectedPaperExecutionBackend() === "nautilus" ? portState.simulation : "UNKNOWN",
    message,
    error,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEngineState(value: unknown): PaperExecutionEngineState {
  return value === "STOPPED" || value === "RUNNING" ? value : "UNKNOWN";
}

function toSimulationState(value: unknown): PaperExecutionSimulationState {
  return value === "STOPPED" || value === "RUNNING" ? value : "UNKNOWN";
}

function defaultLegacyTransport(): PaperExecutionPortLegacyTransport {
  return {
    fetch: legacyPaperApiFetch,
    json: legacyPaperApiJson,
  };
}

function defaultRuntime(): PaperExecutionPortRuntime {
  return {
    isDesktopApp,
  };
}

function defaultContext(): PaperExecutionPortContext {
  return {
    legacy: defaultLegacyTransport(),
    runtime: defaultRuntime(),
    engine: nautilusEngine,
    simulation: nautilusSimulation,
  };
}

function resolveContext(deps: PaperExecutionPortDependencies = {}): PaperExecutionPortContext {
  const legacyDefaults = defaultLegacyTransport();
  return {
    legacy: {
      fetch: deps.legacy?.fetch ?? legacyDefaults.fetch,
      json: deps.legacy?.json ?? legacyDefaults.json,
    },
    runtime: deps.runtime ?? defaultRuntime(),
    engine: deps.engine ?? nautilusEngine,
    simulation: deps.simulation ?? nautilusSimulation,
  };
}

function unavailableResponse(code: PaperExecutionBackendCode, message: string): Response {
  return new Response(
    JSON.stringify({
      success: false,
      code,
      message,
      backend: getSelectedPaperExecutionBackend(),
      availability: portState.availability,
      engine: portState.engine,
      simulation: portState.simulation,
    }),
    {
      status: 503,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

function notEnabledError(
  code: PaperExecutionBackendCode,
  message: string,
  details?: unknown,
): PaperExecutionPortError {
  return buildError(code, message, details);
}

function isLegacyBackend(): boolean {
  return getSelectedPaperExecutionBackend() === "legacy";
}

export function getPaperExecutionBackend(): PaperExecutionBackend {
  return getSelectedPaperExecutionBackend();
}

export function setPaperExecutionBackend(backend: PaperExecutionBackend): PaperExecutionBackend {
  setSelectedPaperExecutionBackend(backend);
  if (backend === "legacy") {
    portState = {
      backend: "legacy",
      availability: "AVAILABLE",
      engine: "UNKNOWN",
      simulation: "UNKNOWN",
    };
  } else {
    portState = {
      backend: "nautilus",
      availability: isDesktopApp() ? "UNAVAILABLE" : "UNAVAILABLE",
      engine: "UNKNOWN",
      simulation: "UNKNOWN",
      message: isDesktopApp()
        ? "Nautilus backend selected but not activated."
        : "Desktop-only Nautilus backend is unavailable in web runtime.",
      error: buildError(
        isDesktopApp() ? "BACKEND_NOT_AVAILABLE" : "DESKTOP_ONLY",
        isDesktopApp()
          ? "Nautilus backend is selected but not activated."
          : "Nautilus backend is desktop only.",
      ),
    };
  }
  notifyStateChange();
  return getSelectedPaperExecutionBackend();
}

export function resolvePaperExecutionBackend(): PaperExecutionPortState {
  return cloneState();
}

export function getPaperExecutionPortState(): PaperExecutionPortState {
  return cloneState();
}

export async function paperApiFetch(
  path: string,
  init: RequestInit & { assertOk?: boolean } = {},
  deps?: PaperExecutionPortDependencies,
): Promise<Response> {
  const context = resolveContext(deps);
  if (isLegacyBackend()) {
    return context.legacy.fetch(path, init);
  }

  if (!context.runtime.isDesktopApp()) {
    return unavailableResponse(
      "DESKTOP_ONLY",
      "Nautilus Paper backend is desktop only.",
    );
  }

  return unavailableResponse(
    "NAUTILUS_ORDER_PATH_NOT_ENABLED",
    "Nautilus Paper order/state paths are not enabled in N3D.1.",
  );
}

export async function paperApiJson<T>(
  path: string,
  init: RequestInit & { assertOk?: boolean } = {},
  deps?: PaperExecutionPortDependencies,
): Promise<{ res: Response; data: T }> {
  const res = await paperApiFetch(path, { ...init, assertOk: false }, deps);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json") && !ct.includes("+json")) {
    const snippet = (await res.text()).slice(0, 120).replace(/\s+/g, " ");
    throw new Error(
      res.ok
        ? `Paper execution port returned non-JSON (${path})`
        : `Paper execution port error ${res.status} (${path}): ${snippet}`,
    );
  }
  const data = (await res.json()) as T;
  return { res, data };
}

async function legacyJson<T>(
  context: PaperExecutionPortContext,
  path: string,
  init: RequestInit & { assertOk?: boolean } = {},
): Promise<T> {
  const { data } = await context.legacy.json<T>(path, init);
  return data;
}

function ensureNautilusSelected(runtime?: PaperExecutionPortRuntime): PaperExecutionPortError {
  const desktop = runtime?.isDesktopApp?.() ?? isDesktopApp();
  if (isLegacyBackend()) {
    return buildError(
      "NOT_ENABLED_IN_N3D1",
      "Nautilus Paper backend is not selected.",
    );
  }
  if (!desktop) {
    return buildError(
      "DESKTOP_ONLY",
      "Nautilus Paper backend is desktop only.",
    );
  }
  return buildError(
    "NAUTILUS_ORDER_PATH_NOT_ENABLED",
    "Nautilus Paper order/state paths are not enabled in N3D.1.",
  );
}

function engineStatusFromWire(status: NautilusEngineStatusWire): PaperExecutionPortState {
  return {
    backend: getSelectedPaperExecutionBackend(),
    availability: status.state === "HEALTHY" ? "AVAILABLE" : "DEGRADED",
    engine: status.state === "STOPPED" ? "STOPPED" : status.state === "HEALTHY" ? "RUNNING" : status.state === "STARTING" ? "UNKNOWN" : status.state === "STOPPING" ? "UNKNOWN" : "UNKNOWN",
    simulation: portState.simulation,
    message: status.lastError ?? (status.state === "HEALTHY" ? "Nautilus engine healthy." : "Nautilus engine degraded."),
  };
}

function simulationStateFromWire(state: { state?: unknown }): PaperExecutionSimulationState {
  const value = state.state;
  return value === "STOPPED" || value === "RUNNING" ? value : "UNKNOWN";
}

export async function activateNautilusPaperBackend(
  deps?: PaperExecutionPortDependencies,
): Promise<NautilusDesktopPaperActivationResult> {
  const context = resolveContext(deps);
  setSelectedPaperExecutionBackend("nautilus");

  if (!context.runtime.isDesktopApp()) {
    return setState({
      backend: "nautilus",
      availability: "UNAVAILABLE",
      engine: "UNKNOWN",
      simulation: "UNKNOWN",
      message: "Nautilus Paper backend is desktop only.",
      error: buildError("DESKTOP_ONLY", "Nautilus Paper backend is desktop only."),
    });
  }

  try {
    const started = await runNautilusActivationStage("engine.start", () => context.engine.start());
    const status = await runNautilusActivationStage("engine.status", () => context.engine.status());
    const version = await runNautilusActivationStage("engine.version", () => context.engine.version());
    const ping = await runNautilusActivationStage("engine.ping", () => context.engine.ping());

    if (version.nautilusVersion !== EXPECTED_NAUTILUS_VERSION) {
      throw buildError(
        "BACKEND_NOT_AVAILABLE",
        `Unexpected Nautilus version ${version.nautilusVersion}; expected ${EXPECTED_NAUTILUS_VERSION}.`,
        version,
      );
    }

    if (!ping.pong) {
      throw buildError("BACKEND_NOT_AVAILABLE", "Nautilus ping returned false.", ping);
    }

    const simStarted = await runNautilusActivationStage("simulation.start", () => context.simulation.start());
    const simStatus = await runNautilusActivationStage("simulation.status", () => context.simulation.status());

    return setState({
      backend: "nautilus",
      availability: "AVAILABLE",
      engine: toEngineState(status.state === "HEALTHY" || started.state === "HEALTHY" ? "RUNNING" : status.state),
      simulation: simulationStateFromWire(simStatus ?? simStarted),
      message: "Nautilus Paper backend ready.",
    });
  } catch (error) {
    const stageError = error instanceof NautilusActivationStageError ? error : undefined;
    const originalError = stageError?.originalError ?? error;
    const normalized = originalError instanceof PaperExecutionPortError
      ? originalError
      : buildError("BACKEND_NOT_AVAILABLE", originalError instanceof Error ? originalError.message : "Nautilus backend activation failed.", originalError);
    return setState({
      backend: "nautilus",
      availability: "DEGRADED",
      engine: portState.engine,
      simulation: portState.simulation,
      message: normalized.message,
      error: stageError
        ? buildError(normalized.code, normalized.message, {
            activationStage: stageError.activationStage,
            elapsedMs: stageError.elapsedMs,
            originalError: normalized,
          })
        : normalized,
    });
  }
}

export async function deactivateNautilusPaperBackend(
  deps?: PaperExecutionPortDependencies,
): Promise<NautilusDesktopPaperDeactivationResult> {
  const context = resolveContext(deps);
  setSelectedPaperExecutionBackend("nautilus");

  if (!context.runtime.isDesktopApp()) {
    return setState({
      backend: "nautilus",
      availability: "UNAVAILABLE",
      engine: "UNKNOWN",
      simulation: "UNKNOWN",
      message: "Nautilus Paper backend is desktop only.",
      error: buildError("DESKTOP_ONLY", "Nautilus Paper backend is desktop only."),
    });
  }

  try {
    const simStopped = await context.simulation.stop();
    const engineStopped = await context.engine.stop();
    return setState({
      backend: "nautilus",
      availability: "UNAVAILABLE",
      engine: toEngineState(engineStopped.state),
      simulation: simulationStateFromWire(simStopped),
      message: "Nautilus Paper backend deactivated.",
    });
  } catch (error) {
    const normalized = error instanceof PaperExecutionPortError
      ? error
      : buildError("BACKEND_NOT_AVAILABLE", error instanceof Error ? error.message : "Nautilus backend deactivation failed.", error);
    return setState({
      backend: "nautilus",
      availability: "DEGRADED",
      engine: portState.engine,
      simulation: portState.simulation,
      message: normalized.message,
      error: normalized,
    });
  }
}

export type PaperExecutionPort = {
  getBackend: typeof getPaperExecutionBackend;
  setBackend: typeof setPaperExecutionBackend;
  resolveBackend: typeof resolvePaperExecutionBackend;
  getState: typeof getPaperExecutionPortState;
  activateNautilus: typeof activateNautilusPaperBackend;
  deactivateNautilus: typeof deactivateNautilusPaperBackend;
  paperApiFetch: typeof paperApiFetch;
  paperApiJson: typeof paperApiJson;
  previewOrder: (input: Record<string, unknown>, deps?: PaperExecutionPortDependencies) => Promise<unknown>;
  submitOrder: (input: PaperExecutionPortOrderRequest, deps?: PaperExecutionPortDependencies) => Promise<unknown>;
  closePosition: (input: {
    instrument: {
      venue: string;
      marketType: "spot" | "perpetual" | "future" | "option";
      symbol: string;
      baseAsset: string;
      quoteAsset: string;
      exchangeNativeSymbol?: string;
    };
    quantity?: string;
  }, deps?: PaperExecutionPortDependencies) => Promise<PaperOrderSnapshot>;
  cancelOrder: (clientOrderId: string, deps?: PaperExecutionPortDependencies) => Promise<unknown>;
  amendOrder: (input: PaperOrderAmendRequest, deps?: PaperExecutionPortDependencies) => Promise<PaperOrderAmendResult>;
  submitProtectiveOrder: (input: PaperProtectiveOrderRequest, deps?: PaperExecutionPortDependencies) => Promise<PaperOrderSnapshot>;
  getAccount: (deps?: PaperExecutionPortDependencies) => Promise<PaperAccountSnapshot>;
  getPosition: (deps?: PaperExecutionPortDependencies) => Promise<PaperPositionSnapshot | null>;
  getOrders: (deps?: PaperExecutionPortDependencies) => Promise<PaperOrderSnapshot[]>;
  getSettings: (deps?: PaperExecutionPortDependencies) => Promise<PaperTradingSettings>;
  reset: (deps?: PaperExecutionPortDependencies) => Promise<unknown>;
};

function legacyHeadersFromBody(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function legacyOrderResponse<T>(
  context: PaperExecutionPortContext,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  return legacyJson<T>(context, path, legacyHeadersFromBody(body));
}

function defaultClientOrderIdFactory(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!randomUUID) {
    throw buildError("BACKEND_NOT_AVAILABLE", "crypto.randomUUID is unavailable for Nautilus client order IDs.");
  }
  return `gt-paper-${randomUUID()}`;
}

function toNautilusMarketContext(
  input: PaperExecutionPortOrderRequest,
): NautilusPaperMarketAdapterContext {
  return input.executionContext ?? NAUTILUS_PAPER_SIMULATION_CONTEXT;
}

function toNautilusMarketQuantityText(input: PaperExecutionPortOrderRequest): string {
  const quantityText = input.quantityText?.trim();
  if (quantityText) {
    return quantityText;
  }
  throw buildError("NAUTILUS_DECIMAL_QUANTITY_REQUIRED", "Nautilus market quantityText is required.", {
    quantityText: input.quantityText,
  });
}

function toNautilusBackendState(): NautilusPaperBackendState {
  return {
    backend: getSelectedPaperExecutionBackend(),
    availability: portState.availability,
    engine: portState.engine,
    simulation: portState.simulation,
    message: portState.message,
  };
}

function toNautilusOrderIntent(
  input: PaperExecutionPortOrderRequest,
  deps?: PaperExecutionPortDependencies,
) {
  const quantity = toNautilusMarketQuantityText(input);
  if (input.orderType === "limit" && (!Number.isFinite(input.price) || (input.price ?? 0) <= 0)) {
    throw buildError("ORDER_TYPE_NOT_ENABLED", "Nautilus LIMIT price is required.", { price: input.price });
  }
  return {
    clientOrderId: input.clientOrderId?.trim() || deps?.clientOrderIdFactory?.() || defaultClientOrderIdFactory(),
    instrument: {
      venue: "SIM",
      marketType: "perpetual" as const,
      symbol: "BTCUSDT-PERP",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      exchangeNativeSymbol: "BTCUSDT",
    },
    side: input.side === "buy" ? "BUY" as const : "SELL" as const,
    orderType: input.orderType === "limit" ? "LIMIT" as const : "MARKET" as const,
    quantity,
    ...(input.orderType === "limit" ? { price: String(input.price) } : {}),
    timeInForce: "GTC" as const,
    reduceOnly: input.reduceOnly ?? false,
    postOnly: false,
  };
}

function toNautilusMarketIntent(
  input: PaperExecutionPortOrderRequest,
  deps?: PaperExecutionPortDependencies,
): NautilusPaperMarketOrderIntent {
  const executionContext = toNautilusMarketContext(input);
  const quantity = toNautilusMarketQuantityText(input);
  const clientOrderId = input.clientOrderId?.trim() || deps?.clientOrderIdFactory?.() || defaultClientOrderIdFactory();
  return {
    clientOrderId,
    executionContext,
    side: input.side === "buy" ? "BUY" : "SELL",
    quantity,
    reduceOnly: input.reduceOnly,
  };
}

function toMarketOrderError(error: unknown): PaperExecutionPortError {
  if (error instanceof NautilusPaperMarketAdapterError) {
    return buildError(error.code, error.message, error.details);
  }
  return buildError(
    "BACKEND_NOT_AVAILABLE",
    error instanceof Error ? error.message : "Nautilus market order failed.",
    error,
  );
}

function canonicalNautilusMarketContextMatches(input: PaperExecutionPortOrderRequest): boolean {
  const executionContext = input.executionContext ?? NAUTILUS_PAPER_SIMULATION_CONTEXT;
  const expected = NAUTILUS_PAPER_SIMULATION_CONTEXT;
  if ("executionDomain" in executionContext) {
    return (
      executionContext.executionDomain === "paper" &&
      executionContext.chartExchange === expected.chartExchange &&
      executionContext.chartMarketType === expected.chartMarketType &&
      String(executionContext.chartSymbol).trim().toUpperCase() === String(expected.chartSymbol).trim().toUpperCase() &&
      executionContext.referenceMarket.venue === expected.referenceMarket.venue &&
      executionContext.referenceMarket.marketType === expected.referenceMarket.marketType &&
      String(executionContext.referenceMarket.symbol).trim().toUpperCase() === String(expected.referenceMarket.symbol).trim().toUpperCase() &&
      executionContext.executionMarketType === expected.executionMarketType &&
      String(executionContext.executionSymbol).trim().toUpperCase() === String(expected.executionSymbol).trim().toUpperCase() &&
      String(input.symbol ?? "").trim().toUpperCase() === String(expected.executionSymbol).trim().toUpperCase() &&
      (input.chartSymbol ? String(input.chartSymbol).trim().toUpperCase() === String(expected.chartSymbol).trim().toUpperCase() : true)
    );
  }
  const expectedLegacy = DEFAULT_TERMINAL_EXECUTION_CONTEXT;
  return (
    String(executionContext.chartExchange ?? "").trim().toLowerCase() === String(expectedLegacy.chartExchange).toLowerCase() &&
    String(executionContext.chartMarketType ?? "").trim().toLowerCase() === String(expectedLegacy.chartMarketType).toLowerCase() &&
    String(executionContext.chartSymbol ?? "").trim().toUpperCase() === String(expectedLegacy.chartSymbol).trim().toUpperCase() &&
    String(executionContext.executionExchange ?? "").trim().toLowerCase() === String(expectedLegacy.executionExchange).toLowerCase() &&
    String(executionContext.executionMarketType ?? "").trim().toLowerCase() === String(expectedLegacy.executionMarketType).toLowerCase() &&
    String(executionContext.executionSymbol ?? "").trim().toUpperCase() === String(expectedLegacy.executionSymbol).trim().toUpperCase() &&
    String(input.symbol ?? "").trim().toUpperCase() === String(expectedLegacy.executionSymbol).trim().toUpperCase() &&
    (input.chartSymbol ? String(input.chartSymbol).trim().toUpperCase() === String(expectedLegacy.chartSymbol).trim().toUpperCase() : true)
  );
}

export const paperExecutionPort: PaperExecutionPort = {
  getBackend: getPaperExecutionBackend,
  setBackend: setPaperExecutionBackend,
  resolveBackend: resolvePaperExecutionBackend,
  getState: getPaperExecutionPortState,
  activateNautilus: activateNautilusPaperBackend,
  deactivateNautilus: deactivateNautilusPaperBackend,
  paperApiFetch,
  paperApiJson,
  async previewOrder(input: Record<string, unknown>, deps?: PaperExecutionPortDependencies): Promise<unknown> {
    const context = resolveContext(deps);
    if (!isLegacyBackend()) {
      throw buildError("PREVIEW_NOT_ENABLED_FOR_NAUTILUS", "Nautilus Paper preview is not enabled.", {
        backend: getSelectedPaperExecutionBackend(),
      });
    }
    return legacyOrderResponse<unknown>(context, "/api/paper/preview", input);
  },
  async submitOrder(input: PaperExecutionPortOrderRequest, deps?: PaperExecutionPortDependencies): Promise<unknown> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (isLegacyBackend()) {
      return legacyOrderResponse<unknown>(context, "/api/paper/order", input as Record<string, unknown>);
    }

    if (!context.runtime.isDesktopApp()) {
      throw buildError("DESKTOP_ONLY", "Nautilus Paper backend is desktop only.");
    }

    if (!canonicalNautilusMarketContextMatches(input)) {
      throw buildError("UNSUPPORTED_NAUTILUS_PAPER_CONTEXT", "unsupported Nautilus Paper execution context", {
        received: input.executionContext ?? NAUTILUS_PAPER_SIMULATION_CONTEXT,
        approved: NAUTILUS_PAPER_SIMULATION_CONTEXT,
      });
    }

    if (input.orderType === "limit") {
      if (owner) assertPaperOwnerCurrent(owner);
      return context.simulation.submitOrder(toNautilusOrderIntent(input, deps));
    }

    const marketAdapter = createNautilusPaperMarketAdapter({
      snapshotProvider: deps?.marketSnapshotProvider ?? paperMarketSnapshotProvider,
      simulation: context.simulation,
      engine: context.engine,
      nowMs: deps?.nowMs,
      fetch: deps?.fetch,
    });

    try {
      if (owner) assertPaperOwnerCurrent(owner);
      return await marketAdapter.submitMarketOrder(toNautilusBackendState(), toNautilusMarketIntent(input, deps));
    } catch (error) {
      if (error instanceof PaperExecutionPortError) {
        throw error;
      }
      throw toMarketOrderError(error);
    }
  },
  async closePosition(input, deps): Promise<PaperOrderSnapshot> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (isLegacyBackend()) throw buildError("BACKEND_NOT_AVAILABLE", "Canonical close requires Nautilus.");
    if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
    try {
      if (owner) assertPaperOwnerCurrent(owner);
      return mapNautilusOrder(await context.simulation.closePosition(input.instrument, input.quantity));
    } catch (error) {
      throw error instanceof PaperExecutionPortError ? error : buildError("NAUTILUS_BACKEND_NOT_READY", error instanceof Error ? `Nautilus close failed: ${error.message}` : "Nautilus close failed.", error);
    }
  },
  async cancelOrder(clientOrderId: string, deps?: PaperExecutionPortDependencies): Promise<unknown> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (!isLegacyBackend()) {
      if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
      if (owner) assertPaperOwnerCurrent(owner);
      return context.simulation.cancelOrder(clientOrderId);
    }
    return legacyOrderResponse<unknown>(
      context,
      `/api/paper/orders/${encodeURIComponent(clientOrderId)}/cancel`,
      {},
    );
  },
  async amendOrder(input: PaperOrderAmendRequest, deps?: PaperExecutionPortDependencies): Promise<PaperOrderAmendResult> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (isLegacyBackend()) throw buildError("BACKEND_NOT_AVAILABLE", "Paper order amend requires Nautilus.");
    if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
    const replacementPrice = input.triggerPrice ?? input.limitPrice;
    if (!input.clientOrderId.trim() || !Number.isFinite(replacementPrice) || replacementPrice! <= 0) {
      throw buildError("ORDER_TYPE_NOT_ENABLED", "A clientOrderId and positive replacement price are required.");
    }
    const orders = await context.simulation.listOrders();
    const order = orders.find((candidate) => candidate.clientOrderId === input.clientOrderId);
    if (!order) throw buildError("NAUTILUS_BACKEND_NOT_READY", "Nautilus order was not found.");
    if (!["LIMIT", "STOP_MARKET"].includes(order.orderType ?? "") || !["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"].includes(order.status) || Number(order.remainingQuantity) <= 0) {
      throw buildError("ORDER_TYPE_NOT_ENABLED", `Order ${order.clientOrderId} is not amendable in state ${order.status}.`);
    }
    const replacementClientOrderId = deps?.clientOrderIdFactory?.() || defaultClientOrderIdFactory();
    try {
      if (owner) assertPaperOwnerCurrent(owner);
      const result = await context.simulation.replaceOrder(order.clientOrderId, replacementClientOrderId, String(replacementPrice));
      return { operation: "CANCEL_REPLACE", originalOrder: mapNautilusOrder(result.originalOrder), replacementOrder: mapNautilusOrder(result.replacementOrder) };
    } catch (error) {
      throw error instanceof PaperExecutionPortError
        ? error
        : buildError("NAUTILUS_BACKEND_NOT_READY", "Native cancel-replace was not confirmed.", { clientOrderId: order.clientOrderId, error });
    }
  },
  async submitProtectiveOrder(input: PaperProtectiveOrderRequest, deps?: PaperExecutionPortDependencies): Promise<PaperOrderSnapshot> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (isLegacyBackend()) throw buildError("BACKEND_NOT_AVAILABLE", "Protective orders require Nautilus.");
    if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
    if (!input.clientOrderId.trim() || !Number.isFinite(input.price) || input.price <= 0) {
      throw buildError("ORDER_TYPE_NOT_ENABLED", "Protective order requires a positive price.");
    }
    const position = await context.simulation.getPosition();
    if (position.side === "FLAT" || Number(position.quantity) <= 0) {
      throw buildError("ORDER_TYPE_NOT_ENABLED", "Protective order requires an open position.");
    }
    const side = position.side === "LONG" ? "SELL" as const : "BUY" as const;
    if (!Number.isFinite(Number(input.quantity)) || Number(input.quantity) <= 0 || Number(input.quantity) > Number(position.quantity)) {
      throw buildError("ORDER_TYPE_NOT_ENABLED", "Protective quantity must not exceed the open position.");
    }
    const orderType = input.protectionType === "STOP_LOSS" ? "STOP_MARKET" as const : "LIMIT" as const;
    if (owner) assertPaperOwnerCurrent(owner);
    const wire = await context.simulation.submitOrder({
      clientOrderId: input.clientOrderId,
      instrument: position.instrument,
      side,
      orderType,
      quantity: input.quantity,
      ...(orderType === "STOP_MARKET" ? { triggerPrice: String(input.price) } : { price: String(input.price) }),
      timeInForce: "GTC",
      reduceOnly: true,
      postOnly: false,
      metadata: { protectionType: input.protectionType },
    });
    return mapNautilusOrder(wire);
  },
  async getAccount(deps?: PaperExecutionPortDependencies): Promise<PaperAccountSnapshot> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (!isLegacyBackend()) {
      if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
      try {
        if (owner) assertPaperOwnerCurrent(owner);
        return mapNautilusAccount(await context.simulation.getAccount());
      } catch (error) {
        throw error instanceof PaperExecutionPortError
          ? error
          : buildError("NAUTILUS_BACKEND_NOT_READY", "Nautilus account read failed.", error);
      }
    }
    return legacyJson<PaperAccountSnapshot>(context, "/api/paper/account");
  },
  async getPosition(deps?: PaperExecutionPortDependencies): Promise<PaperPositionSnapshot | null> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (!isLegacyBackend()) {
      if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
      try {
        if (owner) assertPaperOwnerCurrent(owner);
        return mapNautilusPosition(await context.simulation.getPosition());
      } catch (error) {
        throw error instanceof PaperExecutionPortError
          ? error
          : buildError("NAUTILUS_BACKEND_NOT_READY", "Nautilus position read failed.", error);
      }
    }
    const data = await legacyJson<{ position: PaperPositionSnapshot | null }>(context, "/api/paper/position");
    return data.position ?? null;
  },
  async getOrders(deps?: PaperExecutionPortDependencies): Promise<PaperOrderSnapshot[]> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (!isLegacyBackend()) {
      if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
      try {
        if (owner) assertPaperOwnerCurrent(owner);
        return (await context.simulation.listOrders()).map(mapNautilusOrder);
      } catch (error) {
        throw error instanceof PaperExecutionPortError
          ? error
          : buildError("NAUTILUS_BACKEND_NOT_READY", "Nautilus orders read failed.", error);
      }
    }
    const data = await legacyJson<{ orders: PaperOrderSnapshot[] }>(context, "/api/paper/orders");
    return data.orders ?? [];
  },
  async getFills(deps?: PaperExecutionPortDependencies): Promise<PaperFillSnapshot[]> {
    const context = resolveContext(deps);
    const owner = !isLegacyBackend() ? capturePaperOwner() : null;
    if (!isLegacyBackend()) {
      if (!context.runtime.isDesktopApp()) throw ensureNautilusSelected(context.runtime);
      try {
        if (owner) assertPaperOwnerCurrent(owner);
        return (await context.simulation.listFills()).map(mapNautilusFill);
      } catch (error) {
        throw error instanceof PaperExecutionPortError
          ? error
          : buildError("NAUTILUS_BACKEND_NOT_READY", "Nautilus fills read failed.", error);
      }
    }
    return [];
  },
  async getSettings(deps?: PaperExecutionPortDependencies): Promise<PaperTradingSettings> {
    const context = resolveContext(deps);
    if (!isLegacyBackend()) {
      throw ensureNautilusSelected(context.runtime);
    }
    return legacyJson<PaperTradingSettings>(context, "/api/paper/settings");
  },
  async reset(deps?: PaperExecutionPortDependencies): Promise<unknown> {
    const context = resolveContext(deps);
    if (!isLegacyBackend()) {
      throw ensureNautilusSelected(context.runtime);
    }
    return legacyOrderResponse<unknown>(context, "/api/paper/reset", {});
  },
};
