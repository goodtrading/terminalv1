import type { Express, Request, Response } from "express";
import { MarketDataGateway } from "../market-gateway";
import type { OrderFlowIdentity } from "@shared/orderFlowState";

export type OrderFlowStateReader = (identity: OrderFlowIdentity, capturedAt?: number) => unknown;

function queryValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function parseOrderFlowIdentityQuery(query: Request["query"]): OrderFlowIdentity {
  const instrument = queryValue(query.instrument)?.toUpperCase();
  const venue = queryValue(query.venue);
  const marketType = queryValue(query.marketType);
  if (!instrument || venue !== "Binance" || (marketType !== "Spot" && marketType !== "Perpetual")) {
    throw new Error("OrderFlowState requires instrument, venue=Binance and marketType=Spot|Perpetual");
  }
  return { instrument, venue: "Binance", marketType };
}

export function registerOrderFlowStateRoute(
  app: Express,
  readState: OrderFlowStateReader = MarketDataGateway.getOrderFlowState,
): void {
  app.get("/api/order-flow/state", (req: Request, res: Response) => {
    try {
      const identity = parseOrderFlowIdentityQuery(req.query);
      const capturedAtRaw = queryValue(req.query.capturedAt);
      const capturedAt = capturedAtRaw == null ? undefined : Number(capturedAtRaw);
      if (capturedAtRaw != null && !Number.isFinite(capturedAt)) throw new Error("Invalid capturedAt");
      res.json(readState(identity, capturedAt));
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid order flow identity" });
    }
  });
}
