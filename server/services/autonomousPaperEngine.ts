import { createHash } from "node:crypto";
import type { ShadowAction, ShadowPosition } from "@shared/shadowTrader";
import type { PaperBbo, PaperExecutionEvidence, PaperExecutionIntent, PaperRiskConfig } from "@shared/autonomousPaper";
import { awaitAutonomousPaperBarrier } from "./autonomousPaperTestBarrier";

export type PaperAutonomousSessionForEngine = {
  sessionId: string;
  ownerUserId: number;
  mode?: string;
  status: string;
  instrument: string;
  venue?: string;
  marketType?: string;
  paperSimulationSessionId?: string | null;
  position: ShadowPosition;
  riskConfig?: PaperRiskConfig;
};

export type PaperExecutionBoundary = {
  submitProtectedEntry(input: {
    ownerUserId: number;
    simulationSessionId: string;
    idempotencyKey: string;
    side: "BUY" | "SELL";
    quantity: string;
    stopLoss: string;
    takeProfit: string;
  }): Promise<Record<string, unknown>>;
  closePosition(input: {
    ownerUserId: number;
    simulationSessionId: string;
    idempotencyKey: string;
  }): Promise<Record<string, unknown>>;
  reconcile(input: {
    ownerUserId: number;
    simulationSessionId: string;
  }): Promise<{ simulationSessionId: string; position: Record<string, unknown>; orders: unknown[] }>;
  persistIntent?(intent: PaperExecutionIntent): Promise<void>;
  recordEvidence?(status: "SUBMISSION_STARTED" | "SUBMITTED" | "AMBIGUOUS" | "RECONCILED", evidence: Record<string, unknown>): Promise<void>;
  canExecute?(): Promise<boolean>;
};

export type PaperDecisionInput = {
  session: PaperAutonomousSessionForEngine;
  decision: {
    decisionId: string;
    action: ShadowAction;
    invalidation: number | null;
  };
  bbo: PaperBbo;
};

export type PaperDecisionOutput = { execution: PaperExecutionEvidence; position: ShadowPosition };

function keyFor(sessionId: string, decisionId: string): string {
  return `n13b:${createHash("sha256").update(`${sessionId}:${decisionId}`).digest("hex").slice(0, 48)}`;
}

function rejected(session: PaperAutonomousSessionForEngine, reason: string, bbo: PaperBbo): PaperDecisionOutput {
  return {
    execution: {
      status: "REJECTED", reason, executionIntent: null, simulationSessionId: session.paperSimulationSessionId ?? "", orderIds: [], protectionGroupId: null, response: null, reconciledPosition: null, reconciledOrders: [],
    },
    position: { ...session.position },
  };
}

function noOp(session: PaperAutonomousSessionForEngine, reason: string): PaperDecisionOutput {
  return {
    execution: { status: "NOOP", reason, executionIntent: null, simulationSessionId: session.paperSimulationSessionId ?? "", orderIds: [], protectionGroupId: null, response: null, reconciledPosition: null, reconciledOrders: [] },
    position: { ...session.position },
  };
}

function parseQuantity(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function createAutonomousPaperEngine(boundary: PaperExecutionBoundary, seedIdempotencyKeys: Iterable<string> = []) {
  const acceptedIdempotencyKeys = new Set(seedIdempotencyKeys);
  return {
    async applyDecision(input: PaperDecisionInput): Promise<PaperDecisionOutput> {
      const { session, decision, bbo } = input;
      const idempotencyKey = keyFor(session.sessionId, decision.decisionId);
      if (acceptedIdempotencyKeys.has(idempotencyKey)) return rejected(session, "DUPLICATE_EXECUTION_INTENT", bbo);
      if (session.mode !== "PAPER_AUTONOMOUS") return rejected(session, "MODE_NOT_PAPER_AUTONOMOUS", bbo);
      if (session.status !== "RUNNING") return rejected(session, "SESSION_NOT_RUNNING", bbo);
      if (session.instrument !== "BTCUSDT" || session.venue !== "Binance" || session.marketType !== "Perpetual") return rejected(session, "MARKET_IDENTITY_NOT_ALLOWED", bbo);
      if (!session.paperSimulationSessionId) return rejected(session, "SIMULATION_SESSION_ID_REQUIRED", bbo);
      if (decision.action === "NO_TRADE" || decision.action === "HOLD") return noOp(session, "NO_EXECUTION_ACTION");
      if (decision.action === "ENTER_LONG" || decision.action === "ENTER_SHORT") {
        if (session.position.direction !== "FLAT") return rejected(session, "PYRAMIDING_NOT_ALLOWED", bbo);
        if (bbo.quality !== "VALID" || !Number.isFinite(bbo.bid) || !Number.isFinite(bbo.ask) || bbo.bid <= 0 || bbo.ask <= bbo.bid) return rejected(session, "BBO_UNAVAILABLE_OR_STALE", bbo);
        const risk = session.riskConfig;
        const quantity = parseQuantity(risk?.fixedQuantity);
        if (!risk || quantity == null || quantity > risk.maxExposure) return rejected(session, "RISK_SIZE_REJECTED", bbo);
        if (risk.requireInvalidation && decision.invalidation == null) return rejected(session, "INVALIDATION_REQUIRED", bbo);
        const side = decision.action === "ENTER_LONG" ? "BUY" : "SELL";
        const reference = side === "BUY" ? bbo.ask : bbo.bid;
        const stopLoss = decision.invalidation ?? (side === "BUY" ? reference - (risk.stopLossDistance ?? 1) : reference + (risk.stopLossDistance ?? 1));
        const takeProfit = side === "BUY" ? reference + (risk.takeProfitDistance ?? 2) : reference - (risk.takeProfitDistance ?? 2);
        if (!Number.isFinite(stopLoss) || !Number.isFinite(takeProfit) || (side === "BUY" ? !(stopLoss < bbo.bid && takeProfit > bbo.ask) : !(takeProfit < bbo.bid && stopLoss > bbo.ask))) return rejected(session, "PROTECTION_LEVELS_INVALID", bbo);
        const intent: PaperExecutionIntent = { executionIntentId: `intent-${keyFor(session.sessionId, decision.decisionId)}`, decisionId: decision.decisionId, sessionId: session.sessionId, simulationSessionId: session.paperSimulationSessionId, ownerUserId: session.ownerUserId, instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual", action: decision.action, side, quantity: risk.fixedQuantity, referenceBbo: bbo, invalidation: decision.invalidation, stopLoss: String(stopLoss), takeProfit: String(takeProfit), reduceOnly: false, createdAt: new Date().toISOString(), marketCapturedAt: bbo.capturedAt, riskPolicyVersion: "N13B-v1", evidenceHash: createHash("sha256").update(`${session.sessionId}:${decision.decisionId}:${bbo.capturedAt}:${side}:${risk.fixedQuantity}:${stopLoss}:${takeProfit}`).digest("hex"), idempotencyKey: keyFor(session.sessionId, decision.decisionId) };
        if (boundary.canExecute && !(await boundary.canExecute())) return rejected(session, "SESSION_NOT_RUNNING", bbo);
        await boundary.persistIntent?.(intent);
        await boundary.recordEvidence?.("SUBMISSION_STARTED", { executionIntentId: intent.executionIntentId, decisionId: intent.decisionId, submittedAt: null });
        await awaitAutonomousPaperBarrier("AFTER_SUBMISSION_STARTED");
        if (boundary.canExecute && !(await boundary.canExecute())) return rejected(session, "SESSION_NOT_RUNNING", bbo);
        const response = await boundary.submitProtectedEntry({ ownerUserId: session.ownerUserId, simulationSessionId: session.paperSimulationSessionId, idempotencyKey: intent.idempotencyKey, side, quantity: intent.quantity, stopLoss: intent.stopLoss!, takeProfit: intent.takeProfit! });
        const submissionStatus = String(response.status ?? "ACKNOWLEDGED") === "ACKNOWLEDGED" ? "SUBMITTED" : "AMBIGUOUS";
        await boundary.recordEvidence?.(submissionStatus, { executionIntentId: intent.executionIntentId, decisionId: intent.decisionId, response });
        acceptedIdempotencyKeys.add(intent.idempotencyKey);
        const reconciled = await boundary.reconcile({ ownerUserId: session.ownerUserId, simulationSessionId: session.paperSimulationSessionId });
        await boundary.recordEvidence?.("RECONCILED", { executionIntentId: intent.executionIntentId, decisionId: intent.decisionId, response, reconciledPosition: reconciled.position, reconciledOrders: reconciled.orders });
        return { execution: { status: String(response.status ?? "ACKNOWLEDGED") === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "AMBIGUOUS", reason: null, executionIntent: intent, simulationSessionId: reconciled.simulationSessionId, orderIds: [response.entryOrderId, response.stopOrderId, response.takeProfitOrderId].filter((x): x is string => typeof x === "string"), protectionGroupId: typeof response.protectionGroupId === "string" ? response.protectionGroupId : null, response, reconciledPosition: reconciled.position, reconciledOrders: reconciled.orders }, position: { ...session.position, direction: side === "BUY" ? "LONG" : "SHORT", quantity, entryPrice: reference, entryTime: bbo.capturedAt, entryDecisionId: decision.decisionId, invalidation: decision.invalidation } };
      }
      if (decision.action === "EXIT") {
        if (session.position.direction === "FLAT") return noOp(session, "FLAT_EXIT_NOOP");
        const intentKey = keyFor(session.sessionId, decision.decisionId);
        const side = session.position.direction === "LONG" ? "SELL" : "BUY";
        const intent: PaperExecutionIntent = { executionIntentId: `intent-${keyFor(session.sessionId, decision.decisionId)}`, decisionId: decision.decisionId, sessionId: session.sessionId, simulationSessionId: session.paperSimulationSessionId, ownerUserId: session.ownerUserId, instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual", action: "EXIT", side, quantity: String(session.position.quantity), referenceBbo: bbo, invalidation: null, stopLoss: null, takeProfit: null, reduceOnly: true, createdAt: new Date().toISOString(), marketCapturedAt: bbo.capturedAt, riskPolicyVersion: "N13B-v1", evidenceHash: createHash("sha256").update(`${session.sessionId}:${decision.decisionId}:${bbo.capturedAt}:${side}:${session.position.quantity}`).digest("hex"), idempotencyKey: intentKey };
        if (boundary.canExecute && !(await boundary.canExecute())) return rejected(session, "SESSION_NOT_RUNNING", bbo);
        await boundary.persistIntent?.(intent);
        await boundary.recordEvidence?.("SUBMISSION_STARTED", { executionIntentId: intent.executionIntentId, decisionId: intent.decisionId, submittedAt: null });
        if (boundary.canExecute && !(await boundary.canExecute())) return rejected(session, "SESSION_NOT_RUNNING", bbo);
        const response = await boundary.closePosition({ ownerUserId: session.ownerUserId, simulationSessionId: session.paperSimulationSessionId, idempotencyKey: intentKey });
        const submissionStatus = String(response.status ?? "ACKNOWLEDGED") === "ACKNOWLEDGED" ? "SUBMITTED" : "AMBIGUOUS";
        await boundary.recordEvidence?.(submissionStatus, { executionIntentId: intent.executionIntentId, decisionId: intent.decisionId, response });
        acceptedIdempotencyKeys.add(intentKey);
        const reconciled = await boundary.reconcile({ ownerUserId: session.ownerUserId, simulationSessionId: session.paperSimulationSessionId });
        await boundary.recordEvidence?.("RECONCILED", { executionIntentId: intent.executionIntentId, decisionId: intent.decisionId, response, reconciledPosition: reconciled.position, reconciledOrders: reconciled.orders });
        return { execution: { status: String(response.status ?? "ACKNOWLEDGED") === "ACKNOWLEDGED" ? "ACKNOWLEDGED" : "AMBIGUOUS", reason: null, executionIntent: intent, simulationSessionId: reconciled.simulationSessionId, orderIds: typeof response.orderId === "string" ? [response.orderId] : [], protectionGroupId: null, response, reconciledPosition: reconciled.position, reconciledOrders: reconciled.orders }, position: { direction: "FLAT", quantity: 0, entryPrice: null, entryTime: null, entryDecisionId: null, invalidation: null, realizedPnl: session.position.realizedPnl } };
      }
      return rejected(session, "ACTION_NOT_EXECUTABLE", bbo);
    },
  };
}
