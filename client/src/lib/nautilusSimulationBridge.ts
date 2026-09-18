import { isTauriRuntime } from "@/lib/desktopRuntime";
import { apiUrl } from "@/lib/apiBase";
import { apiRequest } from "@/lib/queryClient";
import { assertPaperOwnerCurrent, capturePaperOwner } from "@/lib/paperOwnerContext";

export type NautilusSimulationInstrumentWire = {
  venue: string;
  marketType: "spot" | "perpetual" | "future" | "option";
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  exchangeNativeSymbol?: string;
  metadata?: Record<string, unknown>;
};

export type NautilusSimulationOrderSideWire = "BUY" | "SELL";
export type NautilusSimulationOrderTypeWire = "MARKET" | "LIMIT" | "STOP_MARKET";
export type NautilusSimulationTimeInForceWire = "GTC";
export type NautilusSimulationOrderStatusWire =
  | "CREATED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_PENDING"
  | "CANCELED"
  | "EXPIRED";
export type NautilusSimulationPositionSideWire = "LONG" | "SHORT" | "FLAT";
export type NautilusSimulationStateWire = "STOPPED" | "RUNNING";

export type NautilusSimulationOrderIntentWire = {
  clientOrderId: string;
  instrument: NautilusSimulationInstrumentWire;
  side: NautilusSimulationOrderSideWire;
  orderType: NautilusSimulationOrderTypeWire;
  quantity: string;
  price?: string;
  triggerPrice?: string;
  timeInForce: NautilusSimulationTimeInForceWire;
  reduceOnly: boolean;
  postOnly: boolean;
  strategyId?: string;
  playbookId?: string;
  setupId?: string;
  metadata?: Record<string, unknown>;
};

export type NautilusSimulationOrderTimestampsWire = {
  createdAt?: number;
  updatedAt?: number;
  acceptedAt?: number;
  rejectedAt?: number;
  firstFillAt?: number;
  lastFillAt?: number;
  canceledAt?: number;
  completedAt?: number;
  expiredAt?: number;
};

export type NautilusSimulationOrderStateWire = {
  clientOrderId: string;
  venueOrderId?: string;
  instrument: NautilusSimulationInstrumentWire;
  side: NautilusSimulationOrderSideWire;
  orderType: NautilusSimulationOrderTypeWire;
  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;
  price?: string;
  triggerPrice?: string;
  protectionType?: "STOP_LOSS" | "TAKE_PROFIT";
  averageFillPrice?: string;
  status: NautilusSimulationOrderStatusWire;
  reason?: string;
  timestamps: NautilusSimulationOrderTimestampsWire;
  metadata?: Record<string, unknown>;
};

export type NautilusSimulationReplaceOrderWire = {
  operation: "CANCEL_REPLACE";
  originalOrder: NautilusSimulationOrderStateWire;
  replacementOrder: NautilusSimulationOrderStateWire;
};

export type NautilusSimulationFillWire = {
  fillId: string;
  clientOrderId: string;
  venueOrderId?: string;
  instrument: NautilusSimulationInstrumentWire;
  side: "BUY" | "SELL";
  price: string;
  quantity: string;
  timestamp: number;
  fee?: string;
  feeAsset?: string;
  liquidity?: string;
};

export type NautilusEvidenceOutboxStatus = "PENDING" | "CONFLICT";

export type NautilusEvidenceOutboxItem = {
  accountId: string;
  environment: string;
  source: string;
  eventId: string;
  payload: NautilusPaperOrderEventEvidenceWire;
  status: NautilusEvidenceOutboxStatus;
  attempts: number;
  lastError: string | null;
};

export type NautilusEvidenceOutboxDiagnostics = {
  pendingCount: number;
  conflictCount: number;
  lastDeliveryFailure: string | null;
};

export type NautilusPaperOrderEventEvidenceWire = {
  eventId: string;
  eventType: string;
  tsEventNs: string;
  tsInitNs: string;
  environment: "PAPER";
  source: "NAUTILUS_PAPER";
  clientOrderId?: string;
  venueOrderId?: string;
  tradeId?: string;
  positionId?: string;
  side?: string;
  orderType?: string;
  quantity?: string;
  price?: string;
  triggerPrice?: string;
  liquiditySide?: string;
  reduceOnly?: boolean;
  reduceOnlySource: "EVENT_FACTUAL" | "ORDER_FACTUAL" | "NOT_AVAILABLE";
  tags: string[];
  tagsSource: "EVENT_FACTUAL" | "ORDER_FACTUAL" | "NOT_AVAILABLE";
  contingencyType?: string;
  orderListId?: string | null;
  linkedOrderIds: string[];
  parentOrderId?: string | null;
  reason?: string | null;
};

export type NautilusEvidenceOutboxEnqueueResult = {
  insertedCount: number;
  duplicateCount: number;
  pendingCount: number;
};

export type NautilusSimulationPositionWire = {
  instrument: NautilusSimulationInstrumentWire;
  side: NautilusSimulationPositionSideWire;
  quantity: string;
  averageEntryPrice?: string;
  markPrice?: string;
  realizedPnl: string;
  unrealizedPnl: string;
  feesTotal?: string;
  openedAt?: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
};

export type NautilusSimulationAccountWire = {
  accountId: string;
  venue: string;
  currency: string;
  equity: string;
  balance: string;
  availableBalance: string;
  marginUsed?: string;
  maintenanceMargin?: string;
  realizedPnl: string;
  unrealizedPnl: string;
  feesTotal?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
};

export type NautilusSimulationStatusWire = {
  state: NautilusSimulationStateWire;
  started: boolean;
  hasSimulation: boolean;
  simulationProtocolVersion: number;
  quoteStream?: NautilusQuoteStreamStatusWire;
  market?: NautilusSimulationMarketStatusWire;
};

export type NautilusQuoteStreamStatusWire = {
  configured: boolean;
  connected: boolean;
  sourceAvailable: boolean;
  threadAlive: boolean;
  framesReceived: number;
  decodeErrors: number;
  sequenceErrors: number;
  reconnectCount: number;
  lastSequence: number | null;
  lastAppliedAt: number | null;
  quoteAgeMs: number | null;
  lastSourceTimestamp: number | null;
  lastLocalAppliedTimestamp: number | null;
};

export type NautilusSimulationMarketStatusWire = {
  instrument: string;
  venue: string;
  marketType: string;
  bestBid: string;
  bestAsk: string;
  updatedAt: number;
};

export type NautilusSimulationLifecycleWire = NautilusSimulationStatusWire & {
  alreadyRunning?: boolean;
  alreadyStopped?: boolean;
  reset?: boolean;
};

export type NautilusQuoteCapabilityWire = {
  success: true;
  streamUrl: string;
  capabilityToken: string;
  issuedAt: number;
  expiresAt: number;
  protocolVersion: number;
  allowedInstrument: "BTCUSDT-PERP";
  allowedMarket: "perpetual";
  [key: string]: unknown;
};

export type NautilusDiagnosticQuoteWire = {
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  timestamp: number;
};

export type NautilusDiagnosticQuoteResponseWire = {
  diagnosticOnly: boolean;
  simulationProtocolVersion: number;
  state: NautilusSimulationStateWire;
  quote: NautilusDiagnosticQuoteWire;
};

export type NautilusMarketSnapshotSourceWire = {
  venue: string;
  marketType: string;
  symbol: string;
};

export type NautilusMarketSnapshotInstrumentWire = {
  venue: string;
  marketType: string;
  symbol: string;
};

export type NautilusMarketSnapshotWire = {
  source: NautilusMarketSnapshotSourceWire;
  simulationInstrument: NautilusMarketSnapshotInstrumentWire;
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  timestampMs: number;
};

export type NautilusMarketSnapshotAppliedWire = {
  applied: boolean;
  sourceVenue: string;
  sourceMarketType: string;
  sourceSymbol: string;
  simulationVenue: string;
  simulationMarketType: string;
  simulationSymbol: string;
  timestampMs: number;
  controlPlane?: string;
};

export type NautilusSimulationCommandErrorCategory = "DAEMON" | "TRANSPORT" | "PROTOCOL" | "SIMULATION";

export class NautilusSimulationCommandError extends Error {
  readonly category: NautilusSimulationCommandErrorCategory;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    category: NautilusSimulationCommandErrorCategory,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "NautilusSimulationCommandError";
    this.category = category;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  override toJSON(): NautilusSimulationCommandError {
    return this;
  }
}

type InvokeLikeError = {
  category?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

const COMMANDS = {
  status: "nautilus_simulation_status",
  start: "nautilus_simulation_start",
  stop: "nautilus_simulation_stop",
  reset: "nautilus_simulation_reset",
  submitOrder: "nautilus_simulation_submit_order",
  closePosition: "nautilus_simulation_close_position",
  cancelOrder: "nautilus_simulation_cancel_order",
  replaceOrder: "nautilus_simulation_replace_order",
  getOrder: "nautilus_simulation_get_order",
  listOrders: "nautilus_simulation_list_orders",
  listOrderEvents: "nautilus_simulation_list_order_events",
  listFills: "nautilus_simulation_list_fills",
  getPosition: "nautilus_simulation_get_position",
  getAccount: "nautilus_simulation_get_account",
  injectQuoteDiagnostic: "nautilus_simulation_inject_quote_diagnostic",
  applyMarketSnapshot: "nautilus_simulation_apply_market_snapshot",
  outboxEnqueue: "enqueue_nautilus_evidence_outbox",
  outboxList: "list_nautilus_evidence_outbox",
  outboxAck: "ack_nautilus_evidence_outbox",
  outboxFailure: "mark_nautilus_evidence_outbox_failure",
  outboxDiagnostics: "nautilus_evidence_outbox_diagnostics",
} as const;

function nativeUnavailableError(details?: unknown): NautilusSimulationCommandError {
  return new NautilusSimulationCommandError(
    "TRANSPORT",
    "native_unavailable",
    "Tauri native runtime is unavailable",
    details,
  );
}

function malformedNativeRejectionError(details?: unknown): NautilusSimulationCommandError {
  return new NautilusSimulationCommandError(
    "PROTOCOL",
    "malformed_native_rejection",
    "Malformed native rejection",
    details,
  );
}

function structuredCommandError(
  category: NautilusSimulationCommandErrorCategory,
  code: string,
  message: string,
  details?: unknown,
): NautilusSimulationCommandError {
  return new NautilusSimulationCommandError(category, code, message, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readRequiredString(value: unknown, path: string): string {
  if (!isString(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readOptionalNullableString(value: unknown, path: string): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (!isString(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readRequiredBoolean(value: unknown, path: string): boolean {
  if (!isBoolean(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readRequiredNumber(value: unknown, path: string): number {
  if (!isNumber(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readOptionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (!isBoolean(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readOptionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (!isNumber(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (!isString(value) || !allowed.includes(value as T)) {
    throw malformedNativeRejectionError({ path, value, allowed });
  }
  return value as T;
}

function readOptionalRecord(value: unknown, path: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw malformedNativeRejectionError({ path, value });
  return value;
}

function readQuoteCapability(value: unknown): NautilusQuoteCapabilityWire {
  if (!isRecord(value)) {
    throw new NautilusSimulationCommandError("PROTOCOL", "invalid_quote_capability", "Invalid quote stream capability response");
  }
  const capability = value as Partial<NautilusQuoteCapabilityWire>;
  if (
    capability.success !== true ||
    !isString(capability.streamUrl) ||
    capability.streamUrl.length === 0 ||
    !isString(capability.capabilityToken) ||
    capability.capabilityToken.length === 0 ||
    !isNumber(capability.issuedAt) ||
    !isNumber(capability.expiresAt) ||
    capability.expiresAt <= capability.issuedAt ||
    capability.protocolVersion !== 1 ||
    capability.allowedInstrument !== "BTCUSDT-PERP" ||
    capability.allowedMarket !== "perpetual"
  ) {
    throw new NautilusSimulationCommandError("PROTOCOL", "invalid_quote_capability", "Invalid quote stream capability response");
  }
  return value as NautilusQuoteCapabilityWire;
}

function readInstrument(value: unknown): NautilusSimulationInstrumentWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "instrument", value });
  const instrument: NautilusSimulationInstrumentWire = {
    venue: readRequiredString(value.venue, "instrument.venue"),
    marketType: readEnum(value.marketType, ["spot", "perpetual", "future", "option"], "instrument.marketType"),
    symbol: readRequiredString(value.symbol, "instrument.symbol"),
    baseAsset: readRequiredString(value.baseAsset, "instrument.baseAsset"),
    quoteAsset: readRequiredString(value.quoteAsset, "instrument.quoteAsset"),
  };
  const exchangeNativeSymbol = readOptionalString(value.exchangeNativeSymbol, "instrument.exchangeNativeSymbol");
  if (exchangeNativeSymbol !== undefined) instrument.exchangeNativeSymbol = exchangeNativeSymbol;
  const metadata = readOptionalRecord(value.metadata, "instrument.metadata");
  if (metadata !== undefined) instrument.metadata = metadata;
  return instrument;
}

function readTimestamps(value: unknown): NautilusSimulationOrderTimestampsWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "timestamps", value });
  const timestamps: NautilusSimulationOrderTimestampsWire = {};
  const createdAt = readOptionalNumber(value.createdAt, "timestamps.createdAt");
  if (createdAt !== undefined) timestamps.createdAt = createdAt;
  const updatedAt = readOptionalNumber(value.updatedAt, "timestamps.updatedAt");
  if (updatedAt !== undefined) timestamps.updatedAt = updatedAt;
  const acceptedAt = readOptionalNumber(value.acceptedAt, "timestamps.acceptedAt");
  if (acceptedAt !== undefined) timestamps.acceptedAt = acceptedAt;
  const rejectedAt = readOptionalNumber(value.rejectedAt, "timestamps.rejectedAt");
  if (rejectedAt !== undefined) timestamps.rejectedAt = rejectedAt;
  const firstFillAt = readOptionalNumber(value.firstFillAt, "timestamps.firstFillAt");
  if (firstFillAt !== undefined) timestamps.firstFillAt = firstFillAt;
  const lastFillAt = readOptionalNumber(value.lastFillAt, "timestamps.lastFillAt");
  if (lastFillAt !== undefined) timestamps.lastFillAt = lastFillAt;
  const canceledAt = readOptionalNumber(value.canceledAt, "timestamps.canceledAt");
  if (canceledAt !== undefined) timestamps.canceledAt = canceledAt;
  const completedAt = readOptionalNumber(value.completedAt, "timestamps.completedAt");
  if (completedAt !== undefined) timestamps.completedAt = completedAt;
  const expiredAt = readOptionalNumber(value.expiredAt, "timestamps.expiredAt");
  if (expiredAt !== undefined) timestamps.expiredAt = expiredAt;
  return timestamps;
}

function readOrderState(value: unknown): NautilusSimulationOrderStateWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "order", value });
  const order: NautilusSimulationOrderStateWire = {
    clientOrderId: readRequiredString(value.clientOrderId, "order.clientOrderId"),
    instrument: readInstrument(value.instrument),
    side: readEnum(value.side, ["BUY", "SELL"], "order.side"),
    orderType: readEnum(value.orderType, ["MARKET", "LIMIT", "STOP_MARKET"], "order.orderType"),
    quantity: readRequiredString(value.quantity, "order.quantity"),
    filledQuantity: readRequiredString(value.filledQuantity, "order.filledQuantity"),
    remainingQuantity: readRequiredString(value.remainingQuantity, "order.remainingQuantity"),
    status: readEnum(
      value.status,
      ["CREATED", "SUBMITTED", "ACCEPTED", "REJECTED", "PARTIALLY_FILLED", "FILLED", "CANCEL_PENDING", "CANCELED", "EXPIRED"],
      "order.status",
    ),
    timestamps: readTimestamps(value.timestamps),
  };
  const venueOrderId = readOptionalString(value.venueOrderId, "order.venueOrderId");
  if (venueOrderId !== undefined) order.venueOrderId = venueOrderId;
  const averageFillPrice = readOptionalString(value.averageFillPrice, "order.averageFillPrice");
  if (averageFillPrice !== undefined) order.averageFillPrice = averageFillPrice;
  const price = readOptionalString(value.price, "order.price");
  if (price !== undefined) order.price = price;
  const triggerPrice = readOptionalString(value.triggerPrice, "order.triggerPrice");
  if (triggerPrice !== undefined) order.triggerPrice = triggerPrice;
  const protectionType = readOptionalString(value.protectionType, "order.protectionType");
  if (protectionType === "STOP_LOSS" || protectionType === "TAKE_PROFIT") order.protectionType = protectionType;
  const reason = readOptionalString(value.reason, "order.reason");
  if (reason !== undefined) order.reason = reason;
  const metadata = readOptionalRecord(value.metadata, "order.metadata");
  if (metadata !== undefined) order.metadata = metadata;
  return order;
}

function readFill(value: unknown): NautilusSimulationFillWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "fill", value });
  const fill: NautilusSimulationFillWire = {
    fillId: readRequiredString(value.fillId, "fill.fillId"),
    clientOrderId: readRequiredString(value.clientOrderId, "fill.clientOrderId"),
    instrument: readInstrument(value.instrument),
    side: readEnum(value.side, ["BUY", "SELL"], "fill.side"),
    price: readRequiredString(value.price, "fill.price"),
    quantity: readRequiredString(value.quantity, "fill.quantity"),
    timestamp: readRequiredNumber(value.timestamp, "fill.timestamp"),
  };
  for (const [key, path] of [["venueOrderId", "fill.venueOrderId"], ["fee", "fill.fee"], ["feeAsset", "fill.feeAsset"], ["liquidity", "fill.liquidity"]] as const) {
    const item = readOptionalString(value[key], path);
    if (item !== undefined) fill[key] = item;
  }
  return fill;
}

function readOrderEventEvidence(value: unknown): NautilusPaperOrderEventEvidenceWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "orderEvent", value });
  const reduceOnlySource = readEnum(value.reduceOnlySource, ["EVENT_FACTUAL", "ORDER_FACTUAL", "NOT_AVAILABLE"], "orderEvent.reduceOnlySource");
  const tagsSource = readEnum(value.tagsSource, ["EVENT_FACTUAL", "ORDER_FACTUAL", "NOT_AVAILABLE"], "orderEvent.tagsSource");
  const tags = value.tags;
  const linkedOrderIds = value.linkedOrderIds;
  if (!Array.isArray(tags) || !tags.every(isString)) throw malformedNativeRejectionError({ path: "orderEvent.tags", value: tags });
  if (!Array.isArray(linkedOrderIds) || !linkedOrderIds.every(isString)) throw malformedNativeRejectionError({ path: "orderEvent.linkedOrderIds", value: linkedOrderIds });
  const event: NautilusPaperOrderEventEvidenceWire = {
    eventId: readRequiredString(value.eventId, "orderEvent.eventId"),
    eventType: readRequiredString(value.eventType, "orderEvent.eventType"),
    tsEventNs: readRequiredString(value.tsEventNs, "orderEvent.tsEventNs"),
    tsInitNs: readRequiredString(value.tsInitNs, "orderEvent.tsInitNs"),
    environment: readEnum(value.environment, ["PAPER"], "orderEvent.environment"),
    source: readEnum(value.source, ["NAUTILUS_PAPER"], "orderEvent.source"),
    reduceOnlySource,
    tags: [...tags],
    tagsSource,
    linkedOrderIds: [...linkedOrderIds],
  };
  for (const [key, path] of [
    ["clientOrderId", "orderEvent.clientOrderId"], ["venueOrderId", "orderEvent.venueOrderId"],
    ["tradeId", "orderEvent.tradeId"], ["positionId", "orderEvent.positionId"], ["side", "orderEvent.side"],
    ["orderType", "orderEvent.orderType"], ["quantity", "orderEvent.quantity"], ["price", "orderEvent.price"],
    ["triggerPrice", "orderEvent.triggerPrice"], ["liquiditySide", "orderEvent.liquiditySide"],
    ["contingencyType", "orderEvent.contingencyType"], ["orderListId", "orderEvent.orderListId"],
    ["parentOrderId", "orderEvent.parentOrderId"], ["reason", "orderEvent.reason"],
  ] as const) {
    const item = ["orderListId", "parentOrderId", "reason"].includes(key)
      ? readOptionalNullableString(value[key], path)
      : readOptionalString(value[key], path);
    if (item !== undefined) (event as Record<string, unknown>)[key] = item;
  }
  const reduceOnly = value.reduceOnly;
  if (reduceOnly !== undefined && typeof reduceOnly !== "boolean") throw malformedNativeRejectionError({ path: "orderEvent.reduceOnly", value: reduceOnly });
  if (reduceOnly !== undefined) event.reduceOnly = reduceOnly;
  return event;
}

function readPosition(value: unknown): NautilusSimulationPositionWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "position", value });
  const position: NautilusSimulationPositionWire = {
    instrument: readInstrument(value.instrument),
    side: readEnum(value.side, ["LONG", "SHORT", "FLAT"], "position.side"),
    quantity: readRequiredString(value.quantity, "position.quantity"),
    realizedPnl: readRequiredString(value.realizedPnl, "position.realizedPnl"),
    unrealizedPnl: readRequiredString(value.unrealizedPnl, "position.unrealizedPnl"),
    updatedAt: readRequiredNumber(value.updatedAt, "position.updatedAt"),
  };
  const averageEntryPrice = readOptionalString(value.averageEntryPrice, "position.averageEntryPrice");
  if (averageEntryPrice !== undefined) position.averageEntryPrice = averageEntryPrice;
  const markPrice = readOptionalString(value.markPrice, "position.markPrice");
  if (markPrice !== undefined) position.markPrice = markPrice;
  const feesTotal = readOptionalString(value.feesTotal, "position.feesTotal");
  if (feesTotal !== undefined) position.feesTotal = feesTotal;
  const openedAt = readOptionalNumber(value.openedAt, "position.openedAt");
  if (openedAt !== undefined) position.openedAt = openedAt;
  const metadata = readOptionalRecord(value.metadata, "position.metadata");
  if (metadata !== undefined) position.metadata = metadata;
  return position;
}

function readAccount(value: unknown): NautilusSimulationAccountWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "account", value });
  const account: NautilusSimulationAccountWire = {
    accountId: readRequiredString(value.accountId, "account.accountId"),
    venue: readRequiredString(value.venue, "account.venue"),
    currency: readRequiredString(value.currency, "account.currency"),
    equity: readRequiredString(value.equity, "account.equity"),
    balance: readRequiredString(value.balance, "account.balance"),
    availableBalance: readRequiredString(value.availableBalance, "account.availableBalance"),
    realizedPnl: readRequiredString(value.realizedPnl, "account.realizedPnl"),
    unrealizedPnl: readRequiredString(value.unrealizedPnl, "account.unrealizedPnl"),
    timestamp: readRequiredNumber(value.timestamp, "account.timestamp"),
  };
  const marginUsed = readOptionalString(value.marginUsed, "account.marginUsed");
  if (marginUsed !== undefined) account.marginUsed = marginUsed;
  const maintenanceMargin = readOptionalString(value.maintenanceMargin, "account.maintenanceMargin");
  if (maintenanceMargin !== undefined) account.maintenanceMargin = maintenanceMargin;
  const feesTotal = readOptionalString(value.feesTotal, "account.feesTotal");
  if (feesTotal !== undefined) account.feesTotal = feesTotal;
  const metadata = readOptionalRecord(value.metadata, "account.metadata");
  if (metadata !== undefined) account.metadata = metadata;
  return account;
}

function readStatus(value: unknown): NautilusSimulationStatusWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "status", value });
  const status: NautilusSimulationStatusWire = {
    state: readEnum(value.state, ["STOPPED", "RUNNING"], "status.state"),
    started: readRequiredBoolean(value.started, "status.started"),
    hasSimulation: readRequiredBoolean(value.hasSimulation, "status.hasSimulation"),
    simulationProtocolVersion: readRequiredNumber(value.simulationProtocolVersion, "status.simulationProtocolVersion"),
  };
  if (value.quoteStream !== undefined && value.quoteStream !== null) {
    if (!isRecord(value.quoteStream)) throw malformedNativeRejectionError({ path: "status.quoteStream", value: value.quoteStream });
    const stream = value.quoteStream;
    const nullableNumber = (item: unknown, path: string): number | null => item === null ? null : readRequiredNumber(item, path);
    status.quoteStream = {
      configured: readRequiredBoolean(stream.configured, "status.quoteStream.configured"),
      connected: readRequiredBoolean(stream.connected, "status.quoteStream.connected"),
      sourceAvailable: readRequiredBoolean(stream.sourceAvailable, "status.quoteStream.sourceAvailable"),
      threadAlive: readRequiredBoolean(stream.threadAlive, "status.quoteStream.threadAlive"),
      framesReceived: readRequiredNumber(stream.framesReceived, "status.quoteStream.framesReceived"),
      decodeErrors: readRequiredNumber(stream.decodeErrors, "status.quoteStream.decodeErrors"),
      sequenceErrors: readRequiredNumber(stream.sequenceErrors, "status.quoteStream.sequenceErrors"),
      reconnectCount: readRequiredNumber(stream.reconnectCount, "status.quoteStream.reconnectCount"),
      lastSequence: nullableNumber(stream.lastSequence, "status.quoteStream.lastSequence"),
      lastAppliedAt: nullableNumber(stream.lastAppliedAt, "status.quoteStream.lastAppliedAt"),
      quoteAgeMs: nullableNumber(stream.quoteAgeMs, "status.quoteStream.quoteAgeMs"),
      lastSourceTimestamp: nullableNumber(stream.lastSourceTimestamp, "status.quoteStream.lastSourceTimestamp"),
      lastLocalAppliedTimestamp: nullableNumber(stream.lastLocalAppliedTimestamp, "status.quoteStream.lastLocalAppliedTimestamp"),
    };
  }
  if (value.market !== undefined && value.market !== null) {
    if (!isRecord(value.market)) throw malformedNativeRejectionError({ path: "status.market", value: value.market });
    status.market = {
      instrument: readRequiredString(value.market.instrument, "status.market.instrument"),
      venue: readRequiredString(value.market.venue, "status.market.venue"),
      marketType: readRequiredString(value.market.marketType, "status.market.marketType"),
      bestBid: readRequiredString(value.market.bestBid, "status.market.bestBid"),
      bestAsk: readRequiredString(value.market.bestAsk, "status.market.bestAsk"),
      updatedAt: readRequiredNumber(value.market.updatedAt, "status.market.updatedAt"),
    };
  }
  return status;
}

function readLifecycle(value: unknown): NautilusSimulationLifecycleWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "lifecycle", value });
  const lifecycle: NautilusSimulationLifecycleWire = readStatus(value);
  const alreadyRunning = readOptionalBoolean(value.alreadyRunning, "lifecycle.alreadyRunning");
  if (alreadyRunning !== undefined) lifecycle.alreadyRunning = alreadyRunning;
  const alreadyStopped = readOptionalBoolean(value.alreadyStopped, "lifecycle.alreadyStopped");
  if (alreadyStopped !== undefined) lifecycle.alreadyStopped = alreadyStopped;
  const reset = readOptionalBoolean(value.reset, "lifecycle.reset");
  if (reset !== undefined) lifecycle.reset = reset;
  return lifecycle;
}

function readDiagnosticQuote(value: unknown): NautilusDiagnosticQuoteWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "quote", value });
  return {
    bid: readRequiredString(value.bid, "quote.bid"),
    ask: readRequiredString(value.ask, "quote.ask"),
    bidSize: readRequiredString(value.bidSize, "quote.bidSize"),
    askSize: readRequiredString(value.askSize, "quote.askSize"),
    timestamp: readRequiredNumber(value.timestamp, "quote.timestamp"),
  };
}

function readDiagnosticQuoteResponse(value: unknown): NautilusDiagnosticQuoteResponseWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "diagnosticQuoteResponse", value });
  return {
    diagnosticOnly: readRequiredBoolean(value.diagnosticOnly, "diagnosticQuoteResponse.diagnosticOnly"),
    simulationProtocolVersion: readRequiredNumber(
      value.simulationProtocolVersion,
      "diagnosticQuoteResponse.simulationProtocolVersion",
    ),
    state: readEnum(value.state, ["STOPPED", "RUNNING"], "diagnosticQuoteResponse.state"),
    quote: readDiagnosticQuote(value.quote),
  };
}

function readMarketSnapshotSource(value: unknown): NautilusMarketSnapshotSourceWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "snapshot.source", value });
  return {
    venue: readRequiredString(value.venue, "snapshot.source.venue"),
    marketType: readRequiredString(value.marketType, "snapshot.source.marketType"),
    symbol: readRequiredString(value.symbol, "snapshot.source.symbol"),
  };
}

function readMarketSnapshotInstrument(value: unknown): NautilusMarketSnapshotInstrumentWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "snapshot.simulationInstrument", value });
  return {
    venue: readRequiredString(value.venue, "snapshot.simulationInstrument.venue"),
    marketType: readRequiredString(value.marketType, "snapshot.simulationInstrument.marketType"),
    symbol: readRequiredString(value.symbol, "snapshot.simulationInstrument.symbol"),
  };
}

function readMarketSnapshot(value: unknown): NautilusMarketSnapshotWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "snapshot", value });
  return {
    source: readMarketSnapshotSource(value.source),
    simulationInstrument: readMarketSnapshotInstrument(value.simulationInstrument),
    bid: readRequiredString(value.bid, "snapshot.bid"),
    ask: readRequiredString(value.ask, "snapshot.ask"),
    bidSize: readRequiredString(value.bidSize, "snapshot.bidSize"),
    askSize: readRequiredString(value.askSize, "snapshot.askSize"),
    timestampMs: readRequiredNumber(value.timestampMs, "snapshot.timestampMs"),
  };
}

function readMarketSnapshotAck(value: unknown): NautilusMarketSnapshotAppliedWire {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "marketSnapshotAck", value });
  const ack: NautilusMarketSnapshotAppliedWire = {
    applied: readRequiredBoolean(value.applied, "marketSnapshotAck.applied"),
    sourceVenue: readRequiredString(value.sourceVenue, "marketSnapshotAck.sourceVenue"),
    sourceMarketType: readRequiredString(value.sourceMarketType, "marketSnapshotAck.sourceMarketType"),
    sourceSymbol: readRequiredString(value.sourceSymbol, "marketSnapshotAck.sourceSymbol"),
    simulationVenue: readRequiredString(value.simulationVenue, "marketSnapshotAck.simulationVenue"),
    simulationMarketType: readRequiredString(value.simulationMarketType, "marketSnapshotAck.simulationMarketType"),
    simulationSymbol: readRequiredString(value.simulationSymbol, "marketSnapshotAck.simulationSymbol"),
    timestampMs: readRequiredNumber(value.timestampMs, "marketSnapshotAck.timestampMs"),
  };
  const controlPlane = readOptionalString(value.controlPlane, "marketSnapshotAck.controlPlane");
  if (controlPlane !== undefined) ack.controlPlane = controlPlane;
  return ack;
}

function isCommandErrorLike(value: unknown): value is InvokeLikeError {
  return isRecord(value) && ("category" in value || "code" in value || "message" in value || "details" in value);
}

export function normalizeNautilusSimulationCommandError(error: unknown): NautilusSimulationCommandError {
  if (error instanceof NautilusSimulationCommandError) return error;
  if (isCommandErrorLike(error)) {
    const category = error.category;
    const code = error.code;
    const message = error.message;
    if (
      (category === "DAEMON" || category === "TRANSPORT" || category === "PROTOCOL" || category === "SIMULATION") &&
      isString(code) &&
      isString(message)
    ) {
      return structuredCommandError(category, code, message, error.details);
    }
  }
  if (error instanceof Error) {
    return nativeUnavailableError({ message: error.message });
  }
  if (isRecord(error)) {
    return nativeUnavailableError(error);
  }
  return nativeUnavailableError({ value: error });
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

async function invokeCommand<T>(
  command: string,
  args: Record<string, unknown> | undefined,
  decode: (value: unknown) => T,
): Promise<T> {
  if (!isTauriRuntime()) throw nativeUnavailableError({ command });
  try {
    const nativeValue = await tauriInvoke<unknown>(command, args);
    return decode(nativeValue);
  } catch (error) {
    throw normalizeNautilusSimulationCommandError(error);
  }
}

export async function status(): Promise<NautilusSimulationStatusWire> {
  return invokeCommand(COMMANDS.status, undefined, readStatus);
}

export async function start(): Promise<NautilusSimulationLifecycleWire> {
  if (!isTauriRuntime()) throw nativeUnavailableError({ command: COMMANDS.start });
  const response = await apiRequest("/api/desktop/nautilus/quote-capability", {
    method: "POST",
    assertOk: false,
  });
  if (!response.ok) {
    throw new NautilusSimulationCommandError(
      "TRANSPORT",
      "quote_capability_failed",
      "Unable to obtain the short-lived quote stream capability",
    );
  }
  const capability = readQuoteCapability(await response.json());
  return invokeCommand(COMMANDS.start, { quoteStream: capability }, readLifecycle);
}

export async function stop(): Promise<NautilusSimulationLifecycleWire> {
  return invokeCommand(COMMANDS.stop, undefined, readLifecycle);
}

export async function reset(): Promise<NautilusSimulationLifecycleWire> {
  return invokeCommand(COMMANDS.reset, undefined, readLifecycle);
}

function readOutboxItem(value: unknown): NautilusEvidenceOutboxItem {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "outboxItem", value });
  const status = readEnum(value.status, ["PENDING", "CONFLICT"], "outboxItem.status");
  return {
    accountId: readRequiredString(value.accountId, "outboxItem.accountId"),
    environment: readRequiredString(value.environment, "outboxItem.environment"),
    source: readRequiredString(value.source, "outboxItem.source"),
    eventId: readRequiredString(value.eventId, "outboxItem.eventId"),
    payload: readOrderEventEvidence(value.payload),
    status,
    attempts: readRequiredNumber(value.attempts, "outboxItem.attempts"),
    lastError: value.lastError === null ? null : readRequiredString(value.lastError, "outboxItem.lastError"),
  };
}

function readOutboxEnqueueResult(value: unknown): NautilusEvidenceOutboxEnqueueResult {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "outboxEnqueue", value });
  return {
    insertedCount: readRequiredNumber(value.insertedCount, "outboxEnqueue.insertedCount"),
    duplicateCount: readRequiredNumber(value.duplicateCount, "outboxEnqueue.duplicateCount"),
    pendingCount: readRequiredNumber(value.pendingCount, "outboxEnqueue.pendingCount"),
  };
}

function readOutboxDiagnostics(value: unknown): NautilusEvidenceOutboxDiagnostics {
  if (!isRecord(value)) throw malformedNativeRejectionError({ path: "outboxDiagnostics", value });
  return {
    pendingCount: readRequiredNumber(value.pendingCount, "outboxDiagnostics.pendingCount"),
    conflictCount: readRequiredNumber(value.conflictCount, "outboxDiagnostics.conflictCount"),
    lastDeliveryFailure:
      value.lastDeliveryFailure === null
        ? null
        : readRequiredString(value.lastDeliveryFailure, "outboxDiagnostics.lastDeliveryFailure"),
  };
}

export async function enqueueEvidenceOutbox(
  accountId: number,
  events: NautilusPaperOrderEventEvidenceWire[],
): Promise<NautilusEvidenceOutboxEnqueueResult> {
  return invokeCommand(
    COMMANDS.outboxEnqueue,
    { accountId: String(accountId), events },
    readOutboxEnqueueResult,
  );
}

export async function listEvidenceOutbox(accountId: number): Promise<NautilusEvidenceOutboxItem[]> {
  return invokeCommand(COMMANDS.outboxList, { accountId: String(accountId) }, (value) => {
    if (!Array.isArray(value)) throw malformedNativeRejectionError({ path: "outbox", value });
    return value.map(readOutboxItem);
  });
}

export async function getEvidenceOutboxDiagnostics(accountId: number): Promise<NautilusEvidenceOutboxDiagnostics> {
  return invokeCommand(COMMANDS.outboxDiagnostics, { accountId: String(accountId) }, readOutboxDiagnostics);
}

async function markOutboxFailure(
  accountId: number,
  eventIds: string[],
  status: NautilusEvidenceOutboxStatus,
  error: string,
): Promise<void> {
  await invokeCommand(
    COMMANDS.outboxFailure,
    { accountId: String(accountId), eventIds, status, error: error.slice(0, 500) },
    () => undefined,
  );
}

export async function drainEvidenceOutbox(accountId: number): Promise<"EMPTY" | "ACKED" | "PENDING" | "CONFLICT"> {
  const owner = capturePaperOwner();
  if (owner.userId !== 0 && owner.userId !== accountId) {
    throw new Error("PAPER_OWNER_ACCOUNT_MISMATCH");
  }
  assertPaperOwnerCurrent(owner);
  const items = await listEvidenceOutbox(accountId);
  const pending = items.filter((item) => item.status === "PENDING");
  if (pending.length === 0) return items.some((item) => item.status === "CONFLICT") ? "CONFLICT" : "EMPTY";
  const eventIds = pending.map((item) => item.eventId);
  try {
    assertPaperOwnerCurrent(owner);
    const response = await apiRequest("/api/paper/nautilus/order-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: pending.map((item) => item.payload) }),
      assertOk: false,
    });
    assertPaperOwnerCurrent(owner);
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(raw);
      if (isRecord(parsed)) body = parsed;
    } catch {
      // Preserve the pending entry with a bounded transport diagnostic.
    }
    if (response.ok && body.acknowledged === true) {
      await invokeCommand(COMMANDS.outboxAck, { accountId: String(accountId), eventIds }, () => undefined);
      return "ACKED";
    }
    const conflict = response.status === 409 || body.code === "PAPER_ORDER_EVENT_EVIDENCE_CONFLICT";
    await markOutboxFailure(
      accountId,
      eventIds,
      conflict ? "CONFLICT" : "PENDING",
      conflict ? "PAPER_ORDER_EVENT_EVIDENCE_CONFLICT" : `HTTP_${response.status || "NETWORK"}`,
    );
    return conflict ? "CONFLICT" : "PENDING";
  } catch (error) {
    if (error instanceof Error && error.message === "PAPER_OWNER_GENERATION_STALE") throw error;
    assertPaperOwnerCurrent(owner);
    await markOutboxFailure(accountId, eventIds, "PENDING", error instanceof Error ? error.message : "NETWORK_ERROR");
    return "PENDING";
  }
}

function emptyEvidenceAfterMutationError(): NautilusSimulationCommandError {
  return new NautilusSimulationCommandError(
    "TRANSPORT",
    "NAUTILUS_EVIDENCE_EMPTY_AFTER_MUTATION",
    "simulationMutation=SUCCEEDED evidenceCapture=FAILED/EMPTY localEvidenceDurability=NOT_COMMITTED",
  );
}

async function persistObservedOrderEvents(owner: ReturnType<typeof capturePaperOwner>): Promise<void> {
  const events = await listOrderEvents();
  if (events.length === 0) throw emptyEvidenceAfterMutationError();
  assertPaperOwnerCurrent(owner);
  await enqueueEvidenceOutbox(owner.userId, events);
  await drainEvidenceOutbox(owner.userId);
}


async function invokeMutationAndPersist<T>(
  command: string,
  args: Record<string, unknown>,
  decode: (value: unknown) => T,
): Promise<T> {
  const owner = capturePaperOwner();
  const result = await invokeCommand(command, args, decode);
  assertPaperOwnerCurrent(owner);
  await persistObservedOrderEvents(owner);
  return result;
}

export async function submitOrder(intent: NautilusSimulationOrderIntentWire): Promise<NautilusSimulationOrderStateWire> {
  return invokeMutationAndPersist(COMMANDS.submitOrder, { intent }, readOrderState);
}

export async function closePosition(
  instrument: NautilusSimulationInstrumentWire,
  quantity?: string,
): Promise<NautilusSimulationOrderStateWire> {
  return invokeMutationAndPersist(COMMANDS.closePosition, { instrument, quantity }, readOrderState);
}

export async function cancelOrder(clientOrderId: string): Promise<NautilusSimulationOrderStateWire> {
  return invokeMutationAndPersist(COMMANDS.cancelOrder, { clientOrderId }, readOrderState);
}

export async function replaceOrder(
  clientOrderId: string,
  replacementClientOrderId: string,
  limitPrice: string,
): Promise<NautilusSimulationReplaceOrderWire> {
  return invokeMutationAndPersist(COMMANDS.replaceOrder, { clientOrderId, replacementClientOrderId, limitPrice }, (value) => {
    if (!isRecord(value) || value.operation !== "CANCEL_REPLACE") {
      throw malformedNativeRejectionError({ path: "replaceOrder", value });
    }
    return {
      operation: "CANCEL_REPLACE",
      originalOrder: readOrderState(value.originalOrder),
      replacementOrder: readOrderState(value.replacementOrder),
    };
  });
}

export async function getOrder(clientOrderId: string): Promise<NautilusSimulationOrderStateWire> {
  return invokeCommand(COMMANDS.getOrder, { clientOrderId }, readOrderState);
}

export async function listOrders(): Promise<NautilusSimulationOrderStateWire[]> {
  return invokeCommand(COMMANDS.listOrders, undefined, (value) => {
    if (!Array.isArray(value)) throw malformedNativeRejectionError({ path: "orders", value });
    return value.map(readOrderState);
  });
}

export async function listOrderEvents(): Promise<NautilusPaperOrderEventEvidenceWire[]> {
  return invokeCommand(COMMANDS.listOrderEvents, undefined, (value) => {
    if (!Array.isArray(value)) throw malformedNativeRejectionError({ path: "orderEvents", value });
    return value.map(readOrderEventEvidence);
  });
}

export async function listFills(): Promise<NautilusSimulationFillWire[]> {
  return invokeCommand(COMMANDS.listFills, undefined, (value) => {
    if (!Array.isArray(value)) throw malformedNativeRejectionError({ path: "fills", value });
    return value.map(readFill);
  });
}

export async function getPosition(): Promise<NautilusSimulationPositionWire> {
  return invokeCommand(COMMANDS.getPosition, undefined, readPosition);
}

export async function getAccount(): Promise<NautilusSimulationAccountWire> {
  return invokeCommand(COMMANDS.getAccount, undefined, readAccount);
}

export async function injectQuoteDiagnostic(
  quote: NautilusDiagnosticQuoteWire,
): Promise<NautilusDiagnosticQuoteResponseWire> {
  return invokeCommand(COMMANDS.injectQuoteDiagnostic, { quote }, readDiagnosticQuoteResponse);
}

export async function applyMarketSnapshot(
  snapshot: NautilusMarketSnapshotWire,
): Promise<NautilusMarketSnapshotAppliedWire> {
  return invokeCommand(COMMANDS.applyMarketSnapshot, { snapshot }, readMarketSnapshotAck);
}

export const nautilusSimulation = {
  status,
  start,
  stop,
  reset,
  submitOrder,
  closePosition,
  cancelOrder,
  replaceOrder,
  getOrder,
  listOrders,
  listOrderEvents,
  listFills,
  getPosition,
  getAccount,
  injectQuoteDiagnostic,
  applyMarketSnapshot,
  enqueueEvidenceOutbox,
  listEvidenceOutbox,
  drainEvidenceOutbox,
  getEvidenceOutboxDiagnostics,
} as const;
