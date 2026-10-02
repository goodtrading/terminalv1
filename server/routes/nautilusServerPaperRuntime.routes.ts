import { Router, type Request, type RequestHandler, type Response } from "express";
import path from "node:path";
import { requirePaperUserId } from "../middleware/paperAuth";
import { requireSaasAuth } from "../middleware/saasAuth";
import { getFreshPublishedPerpBbo, subscribeNautilusPerpQuoteUpdates } from "../services/nautilusQuoteStream";
import { ensurePerpMarketDataAvailable } from "../services/orderbookServicePerp";
import { startN3D5LocalPaperOperator } from "../services/nautilusLocalDevPaperOperator";
import {
  NautilusServerPaperRuntimeManager,
  ServerPaperRuntimeError,
} from "../services/nautilusServerPaperRuntime";

export type NautilusServerPaperRouterOptions = Readonly<{
  manager: NautilusServerPaperRuntimeManager;
  authenticate: RequestHandler;
  enabled: boolean;
  ordersEnabled?: boolean;
  ensureMarketDataAvailable?: () => void;
}>;

function userId(req: Request, res: Response): number | null {
  return requirePaperUserId(req, res);
}

function sendRuntimeError(res: Response, error: unknown): void {
  if (error instanceof ServerPaperRuntimeError) {
    res.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }
  res.status(503).json({ code: "NAUTILUS_SERVER_PAPER_UNAVAILABLE", message: "Server PAPER runtime is unavailable." });
}

/** Factory exists for isolated route integration tests; production uses SaaS auth. */
export function createNautilusServerPaperRuntimeRouter(options: NautilusServerPaperRouterOptions) {
  const router = Router();
  router.use(options.authenticate);
  router.use((_req, res, next) => {
    if (!options.enabled) {
      res.status(503).json({ code: "NAUTILUS_SERVER_PAPER_DISABLED", message: "Server-managed Nautilus PAPER is disabled." });
      return;
    }
    next();
  });

  router.get("/session", (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    const lifecycle = options.manager.getLifecycle(ownerUserId);
    const executionAuthorization = options.manager.getOrderExecutionAuthorization(ownerUserId);
    res.json({
      ...lifecycle,
      executionAuthorization,
      orderSubmissionEnabled: options.ordersEnabled === true && executionAuthorization.authorized,
    });
  });

  router.post("/session", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      options.ensureMarketDataAvailable?.();
      const result = await options.manager.startForUser(ownerUserId);
      res.status(result.alreadyRunning ? 200 : 201).json({
        ...result,
        lifecycle: "AVAILABLE",
      });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/snapshot", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      res.json(await options.manager.readSnapshot(ownerUserId));
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/market/status", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      const status = await options.manager.readRuntimeStatus(ownerUserId);
      const orders = await options.manager.readOrders(ownerUserId);
      const marketData = status.marketData && typeof status.marketData === "object"
        ? status.marketData as Record<string, unknown>
        : {};
      const activeProtectionOrders = orders
        .filter((item) => {
          const order = item as Record<string, unknown>;
          const state = String(order.status ?? "").toUpperCase();
          return typeof order.protectionType === "string" &&
            ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"].includes(state);
        })
        .map((item) => {
          const order = item as Record<string, unknown>;
          return {
            clientOrderId: order.clientOrderId,
            protectionType: order.protectionType,
            protectionGroupId: order.protectionGroupId ?? null,
            positionId: order.positionId ?? null,
            status: order.status,
          };
        });
      const age = marketData.sourceAgeMs;
      const market = status.market && typeof status.market === "object" ? status.market as Record<string, unknown> : {};
      const bid = Number(market.bestBid);
      const ask = Number(market.bestAsk);
      const quoteFresh = market.instrument === "BTCUSDT-PERP" &&
        marketData.sourceAvailable === true && typeof age === "number" && Number.isFinite(age) && age >= 0 && age <= 3_000 &&
        Number.isFinite(bid) && bid > 0 && Number.isFinite(ask) && ask > bid;
      const executionAuthorization = options.manager.getOrderExecutionAuthorization(ownerUserId);
      const protectionEvaluationState = activeProtectionOrders.length === 0
        ? "NO_ACTIVE_PROTECTIONS"
        : quoteFresh ? "QUOTE_FRESH" : "SUSPENDED_FEED_UNAVAILABLE";
      res.json({
        market: status.market ?? null,
        marketData: status.marketData ?? null,
        execution: {
          environmentAuthorized: process.env.NODE_ENV === "development",
          sessionAuthorized: executionAuthorization.authorized,
          simulationSessionId: executionAuthorization.simulationSessionId,
          quoteFresh,
          ordersEnabled: options.ordersEnabled === true,
          orderSubmissionEnabled: options.ordersEnabled === true && executionAuthorization.authorized && quoteFresh,
        },
        protectionEvaluation: {
          state: protectionEvaluationState,
          reason: protectionEvaluationState === "SUSPENDED_FEED_UNAVAILABLE"
            ? (typeof marketData.reason === "string" ? marketData.reason : "quote_not_fresh")
            : null,
          activeProtectionOrders,
        },
      });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.post("/market/refresh", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      res.json(await options.manager.applyFreshServerQuote(ownerUserId));
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.post("/orders", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    if (options.ordersEnabled !== true) {
      res.status(503).json({ code: "PAPER_ORDER_SUBMISSION_DISABLED", message: "Server PAPER order submission is not enabled." });
      return;
    }
    const executionAuthorization = options.manager.getOrderExecutionAuthorization(ownerUserId);
    if (!executionAuthorization.authorized) {
      res.status(403).json({ code: "PAPER_ORDER_SESSION_NOT_AUTHORIZED", message: "PAPER execution is not authorized for this owner and simulation session." });
      return;
    }
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => !["side", "orderType", "quantity", "price", "triggerPrice", "reduceOnly", "metadata"].includes(key))) {
      res.status(400).json({ code: "INVALID_PAPER_ORDER_INTENT" });
      return;
    }
    const side = typeof body.side === "string" ? body.side.toUpperCase() : "";
    const orderType = typeof body.orderType === "string" ? body.orderType.toUpperCase() : "";
    const quantity = typeof body.quantity === "string" ? body.quantity : "";
    if (!["BUY", "SELL"].includes(side) || !["MARKET", "LIMIT", "STOP_MARKET"].includes(orderType) ||
        !/^\d+(?:\.\d+)?$/.test(quantity) || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || typeof body.reduceOnly !== "boolean") {
      res.status(400).json({ code: "INVALID_PAPER_ORDER_INTENT" });
      return;
    }
    if (body.reduceOnly !== true) {
      res.status(409).json({ code: "PAPER_PROTECTED_ENTRY_REQUIRED", message: "New PAPER exposure must use the protected-entry contract with both SL and TP." });
      return;
    }
    if (orderType === "LIMIT" && (typeof body.price !== "string" || !/^\d+(?:\.\d+)?$/.test(body.price) || !Number.isFinite(Number(body.price)) || Number(body.price) <= 0)) {
      res.status(400).json({ code: "INVALID_PAPER_ORDER_PRICE" });
      return;
    }
    if (orderType === "STOP_MARKET" && (typeof body.triggerPrice !== "string" || !/^\d+(?:\.\d+)?$/.test(body.triggerPrice) || !Number.isFinite(Number(body.triggerPrice)) || Number(body.triggerPrice) <= 0)) {
      res.status(400).json({ code: "INVALID_PAPER_ORDER_TRIGGER" });
      return;
    }
    const metadata = body.metadata;
    if (metadata != null && (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
        Object.keys(metadata).some((key) => !["protectionGroupId", "protectionType"].includes(key)))) {
      res.status(400).json({ code: "INVALID_PAPER_ORDER_METADATA" });
      return;
    }
    if (metadata?.protectionType != null && (
      !["STOP_LOSS", "TAKE_PROFIT"].includes(metadata.protectionType) ||
      typeof metadata.protectionGroupId !== "string" || metadata.protectionGroupId.trim().length < 8 ||
      body.reduceOnly !== true ||
      (metadata.protectionType === "STOP_LOSS" && orderType !== "STOP_MARKET") ||
      (metadata.protectionType === "TAKE_PROFIT" && orderType !== "LIMIT")
    )) {
      res.status(400).json({ code: "INVALID_PAPER_PROTECTION_INTENT" });
      return;
    }
    const idempotencyKey = req.header("Idempotency-Key") ?? "";
    try {
      const result = await options.manager.submitOrderCommand(ownerUserId, idempotencyKey, {
        side,
        orderType,
        quantity,
        ...(typeof body.price === "string" ? { price: body.price } : {}),
        ...(typeof body.triggerPrice === "string" ? { triggerPrice: body.triggerPrice } : {}),
        reduceOnly: body.reduceOnly,
        ...(metadata ? { metadata } : {}),
      });
      res.status(result.created ? 201 : 200).json({
        idempotencyKey,
        status: result.command.status,
        clientOrderId: result.command.clientOrderId,
        order: result.command.response,
        reason: result.command.reason,
      });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.post("/protected-entries", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    if (options.ordersEnabled !== true) {
      res.status(503).json({ code: "PAPER_ORDER_SUBMISSION_DISABLED", message: "Server PAPER order submission is not enabled." });
      return;
    }
    const authorization = options.manager.getOrderExecutionAuthorization(ownerUserId);
    if (!authorization.authorized || authorization.simulationSessionId == null) {
      res.status(403).json({ code: "PAPER_ORDER_SESSION_NOT_AUTHORIZED", message: "PAPER execution is not authorized for this owner and simulation session." });
      return;
    }
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).some((key) => !["side", "quantity", "stopLoss", "takeProfit"].includes(key))) {
      res.status(400).json({ code: "INVALID_PAPER_PROTECTED_ENTRY" });
      return;
    }
    const side = typeof body.side === "string" ? body.side.toUpperCase() : "";
    const decimal = (value: unknown, precision: number) => typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) &&
      Number.isFinite(Number(value)) && Number(value) > 0 && (value.split(".")[1]?.length ?? 0) <= precision;
    if (!["BUY", "SELL"].includes(side) || !decimal(body.quantity, 3) || !decimal(body.stopLoss, 2) || !decimal(body.takeProfit, 2)) {
      res.status(400).json({ code: "INVALID_PAPER_PROTECTED_ENTRY" });
      return;
    }
    const idempotencyKey = req.header("Idempotency-Key") ?? "";
    if (!/^[A-Za-z0-9._:-]{8,90}$/.test(idempotencyKey)) {
      res.status(400).json({ code: "PAPER_IDEMPOTENCY_KEY_INVALID" });
      return;
    }
    try {
      const result = await options.manager.submitProtectedEntryCommand(ownerUserId, idempotencyKey, {
        side: side as "BUY" | "SELL",
        quantity: body.quantity,
        stopLoss: body.stopLoss,
        takeProfit: body.takeProfit,
      });
      res.status(result.created ? 201 : 200).json({
        idempotencyKey,
        status: result.command.status,
        protected: result.command.response?.state === "PROTECTED",
        result: result.command.response,
        reason: result.command.reason,
      });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.post("/close-position", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    if (options.ordersEnabled !== true) {
      res.status(503).json({ code: "PAPER_ORDER_SUBMISSION_DISABLED", message: "Server PAPER order submission is not enabled." });
      return;
    }
    const executionAuthorization = options.manager.getOrderExecutionAuthorization(ownerUserId);
    if (!executionAuthorization.authorized || executionAuthorization.simulationSessionId == null) {
      res.status(403).json({ code: "PAPER_ORDER_SESSION_NOT_AUTHORIZED", message: "PAPER execution is not authorized for this owner and simulation session." });
      return;
    }
    const body = req.body;
    if (body != null && (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length > 0)) {
      res.status(400).json({ code: "INVALID_PAPER_CLOSE_POSITION" });
      return;
    }
    const idempotencyKey = req.header("Idempotency-Key") ?? "";
    try {
      const result = await options.manager.closePositionCommand(ownerUserId, idempotencyKey);
      res.status(result.created ? 201 : 200).json({
        idempotencyKey,
        status: result.command.status,
        closed: result.command.response?.state === "CLOSED",
        result: result.command.response,
        reason: result.command.reason,
      });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/close-position/:idempotencyKey", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    const key = req.params.idempotencyKey;
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      res.status(400).json({ code: "PAPER_IDEMPOTENCY_KEY_INVALID" });
      return;
    }
    try {
      const command = await options.manager.getClosePositionCommand(ownerUserId, key);
      if (!command) {
        res.status(404).json({ code: "PAPER_CLOSE_COMMAND_NOT_FOUND" });
        return;
      }
      res.json({
        idempotencyKey: key,
        status: command.status,
        closed: command.response?.state === "CLOSED",
        result: command.response,
        reason: command.reason,
      });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/protected-entries/:idempotencyKey", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    const key = req.params.idempotencyKey;
    if (!/^[A-Za-z0-9._:-]{8,90}$/.test(key)) {
      res.status(400).json({ code: "PAPER_IDEMPOTENCY_KEY_INVALID" });
      return;
    }
    try {
      const command = await options.manager.getProtectedEntryCommand(ownerUserId, key);
      if (!command) {
        res.status(404).json({ code: "PAPER_COMMAND_NOT_FOUND" });
        return;
      }
      res.json({ idempotencyKey: key, status: command.status, protected: command.response?.state === "PROTECTED", result: command.response, reason: command.reason });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/orders/:idempotencyKey", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    const key = req.params.idempotencyKey;
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) {
      res.status(400).json({ code: "PAPER_IDEMPOTENCY_KEY_INVALID" });
      return;
    }
    try {
      const command = await options.manager.getOrderCommand(ownerUserId, key);
      if (!command) {
        res.status(404).json({ code: "PAPER_COMMAND_NOT_FOUND" });
        return;
      }
      res.json({ idempotencyKey: key, status: command.status, clientOrderId: command.clientOrderId, order: command.response, reason: command.reason });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/orders", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      res.json({ orders: await options.manager.readOrders(ownerUserId) });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/fills", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      res.json({ fills: await options.manager.readFills(ownerUserId) });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.get("/events", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      res.json({ events: await options.manager.readOrderEvents(ownerUserId) });
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  router.delete("/session", async (req, res) => {
    const ownerUserId = userId(req, res);
    if (ownerUserId == null) return;
    try {
      res.json(await options.manager.stopForUser(ownerUserId));
    } catch (error) {
      sendRuntimeError(res, error);
    }
  });

  return router;
}

const runtimeRoot = path.resolve(
  process.env.GT_NAUTILUS_RUNTIME_ROOT ?? path.join(process.cwd(), "build", "n2c", "runtime", "nautilus-runtime"),
);
const enabled = process.env.NODE_ENV === "development" && process.env.GT_NAUTILUS_SERVER_PAPER_ENABLED === "true";
const ordersEnabled = enabled && process.env.GT_NAUTILUS_SERVER_PAPER_ORDERS_ENABLED === "true";
const orderAuthorizationEnabled = ordersEnabled && process.env.GT_NAUTILUS_SERVER_PAPER_ALLOW_ORDER_AUTHORIZATION === "true";
const manager = new NautilusServerPaperRuntimeManager({
  runtimeRoot,
  prewarmPackage: enabled,
  allowOrderAuthorization: orderAuthorizationEnabled,
  ordersEnabled,
  quoteProvider: async () => getFreshPublishedPerpBbo(),
  subscribeQuoteUpdates: (listener) => subscribeNautilusPerpQuoteUpdates(listener),
});

export const nautilusServerPaperRuntimeManager = manager;

export const nautilusServerPaperRuntimeRouter = createNautilusServerPaperRuntimeRouter({
  manager,
  authenticate: requireSaasAuth,
  enabled,
  ordersEnabled,
  ensureMarketDataAvailable: ensurePerpMarketDataAvailable,
});

/**
 * Deliberately server-internal: no route accepts grants. Call only from an
 * audited development operator action with the authenticated owner and exact
 * current simulationSessionId. Grants are in-memory and die with the session.
 */
export function grantNautilusServerPaperExecution(ownerUserId: number, simulationSessionId: string) {
  return manager.grantOrderExecution(ownerUserId, simulationSessionId);
}

export function revokeNautilusServerPaperExecution(ownerUserId: number, simulationSessionId: string) {
  return manager.revokeOrderExecution(ownerUserId, simulationSessionId);
}

/** Called by the backend's graceful process shutdown path. */
export async function shutdownNautilusServerPaperRuntime(): Promise<void> {
  await manager.disconnect();
}

// Explicit temporary local operator channel for the D5 development acceptance.
// No HTTP route is added; the helper is inert unless all dev/order flags and a
// per-process named-pipe path are supplied.
if (process.env.NODE_ENV === "development" &&
    process.env.GT_NAUTILUS_SERVER_PAPER_ENABLED === "true" &&
    process.env.GT_NAUTILUS_SERVER_PAPER_ORDERS_ENABLED === "true" &&
    process.env.GT_NAUTILUS_SERVER_PAPER_ALLOW_ORDER_AUTHORIZATION === "true" &&
    process.env.GT_N3D5_LOCAL_PAPER_OPERATOR === "1") {
  startN3D5LocalPaperOperator(manager);
}
