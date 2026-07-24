import type {
  BingxAccountSnapshot,
  BingxOpenOrderSnapshot,
  BingxPositionSnapshot,
  BingxReconciliationResult,
  BingxTradingActionEvent,
  BingxTradingActionType,
  BingxEventConfidence,
} from "../../../../shared/goodTradingAiBingxAccount";
import { createHash } from "crypto";

const SOURCE = "BINGX_ACCOUNT_READ_ONLY" as const;
const MODE = "REAL_BINGX_READ_ONLY" as const;

function posKey(p: BingxPositionSnapshot): string {
  return `${p.symbol}|${p.side}`;
}

function orderKey(o: BingxOpenOrderSnapshot): string {
  return o.orderId;
}

function eventId(
  type: string,
  accountId: string,
  symbol: string,
  seq: number,
  capturedAt: string,
): string {
  return createHash("sha256")
    .update(`${type}|${accountId}|${symbol}|${seq}|${capturedAt}`)
    .digest("hex")
    .slice(0, 24);
}

function makeEvent(args: {
  sequence: number;
  type: BingxTradingActionType;
  confidence: BingxEventConfidence;
  symbol?: string;
  positionSide?: "long" | "short" | "unknown";
  summary: string;
  capturedAt: string;
  accountId: string;
  reconciliationVersion: number;
  exchangeTimestamp?: string;
}): BingxTradingActionEvent {
  return {
    eventId: eventId(
      args.type,
      args.accountId,
      args.symbol ?? "",
      args.sequence,
      args.capturedAt,
    ),
    sequence: args.sequence,
    type: args.type,
    confidence: args.confidence,
    symbol: args.symbol,
    positionSide: args.positionSide,
    summary: args.summary.slice(0, 280),
    capturedAt: args.capturedAt,
    exchangeTimestamp: args.exchangeTimestamp,
    accountId: args.accountId,
    accountMode: MODE,
    source: SOURCE,
    mentorEligible: false,
    aiConsumptionEnabled: false,
    reconciliationVersion: args.reconciliationVersion,
  };
}

/**
 * Deterministic reconciliation: previous snapshot → current → TradingActionEvents.
 * Does not invent missing actions; marks UNCERTAIN when evidence is weak.
 */
export function reconcileAccountSnapshots(
  previous: BingxAccountSnapshot | null,
  current: Pick<
    BingxAccountSnapshot,
    | "accountId"
    | "positions"
    | "openOrders"
    | "recentFills"
    | "capturedAt"
    | "completeness"
  >,
  reconciliationVersion: number,
): BingxReconciliationResult {
  const events: BingxTradingActionEvent[] = [];
  const notes: string[] = [];
  let seq = 0;
  let uncertain = false;
  const capturedAt = current.capturedAt;
  const accountId = current.accountId;

  if (!previous) {
    for (const p of current.positions) {
      if (p.side === "flat" || p.quantity <= 0) continue;
      events.push(
        makeEvent({
          sequence: seq++,
          type: "POSITION_OPENED",
          confidence: "DERIVED",
          symbol: p.symbol,
          positionSide: p.side === "long" || p.side === "short" ? p.side : "unknown",
          summary: `Observed open ${p.side} ${p.quantity} ${p.symbol}`,
          capturedAt,
          accountId,
          reconciliationVersion,
        }),
      );
    }
    for (const o of current.openOrders) {
      events.push(
        makeEvent({
          sequence: seq++,
          type: "ORDER_OPENED",
          confidence: "DERIVED",
          symbol: o.symbol,
          summary: `Observed open order ${o.side} ${o.symbol}`,
          capturedAt,
          accountId,
          reconciliationVersion,
        }),
      );
    }
    if (current.completeness !== "COMPLETE") {
      uncertain = true;
      notes.push("Initial snapshot incomplete; events marked DERIVED/UNCERTAIN.");
      events.push(
        makeEvent({
          sequence: seq++,
          type: "ACCOUNT_STATE_UNCERTAIN",
          confidence: "UNCERTAIN",
          summary: "Initial account state incomplete",
          capturedAt,
          accountId,
          reconciliationVersion,
        }),
      );
    }
    return {
      version: reconciliationVersion,
      currentCapturedAt: capturedAt,
      events,
      uncertain,
      notes,
    };
  }

  const prevPos = new Map(previous.positions.map((p) => [posKey(p), p]));
  const curPos = new Map(current.positions.map((p) => [posKey(p), p]));
  const allPosKeys = new Set([
    ...Array.from(prevPos.keys()),
    ...Array.from(curPos.keys()),
  ]);

  for (const key of Array.from(allPosKeys)) {
    const a = prevPos.get(key);
    const b = curPos.get(key);
    const symbol = b?.symbol ?? a?.symbol ?? key.split("|")[0];

    if (!a && b && b.quantity > 0) {
      // Possible flip: opposite side existed
      const oppositeSide = b.side === "long" ? "short" : "long";
      const opposite = prevPos.get(`${b.symbol}|${oppositeSide}`);
      if (opposite && opposite.quantity > 0 && !curPos.get(`${b.symbol}|${oppositeSide}`)) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "POSITION_FLIPPED",
            confidence: "DERIVED",
            symbol,
            summary: `Position flipped to ${b.side} ${b.quantity} ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      } else {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "POSITION_OPENED",
            confidence: "DERIVED",
            symbol,
            positionSide: b.side === "long" || b.side === "short" ? b.side : "unknown",
            summary: `Position opened ${b.side} ${b.quantity} ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }
      continue;
    }

    if (a && !b) {
      events.push(
        makeEvent({
          sequence: seq++,
          type: "POSITION_CLOSED",
          confidence: "DERIVED",
          symbol,
          positionSide: a.side === "long" || a.side === "short" ? a.side : "unknown",
          summary: `Position closed ${a.side} ${symbol}`,
          capturedAt,
          accountId,
          reconciliationVersion,
        }),
      );
      continue;
    }

    if (a && b) {
      if (b.quantity > a.quantity + 1e-12) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "POSITION_INCREASED",
            confidence: "DERIVED",
            symbol,
            positionSide: b.side === "long" || b.side === "short" ? b.side : "unknown",
            summary: `Position increased ${a.quantity} → ${b.quantity} ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      } else if (b.quantity + 1e-12 < a.quantity) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "POSITION_REDUCED",
            confidence: "DERIVED",
            symbol,
            positionSide: b.side === "long" || b.side === "short" ? b.side : "unknown",
            summary: `Position reduced ${a.quantity} → ${b.quantity} ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }

      if (
        a.stopLossPrice != null &&
        b.stopLossPrice != null &&
        Math.abs(a.stopLossPrice - b.stopLossPrice) > 1e-8
      ) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "STOP_CHANGED_EXTERNALLY",
            confidence: "DERIVED",
            symbol,
            summary: `Stop observed change on ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }
      if (
        a.takeProfitPrice != null &&
        b.takeProfitPrice != null &&
        Math.abs(a.takeProfitPrice - b.takeProfitPrice) > 1e-8
      ) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "TAKE_PROFIT_CHANGED_EXTERNALLY",
            confidence: "DERIVED",
            symbol,
            summary: `Take-profit observed change on ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }
      if (
        a.marginMode &&
        b.marginMode &&
        a.marginMode !== "unknown" &&
        b.marginMode !== "unknown" &&
        a.marginMode !== b.marginMode
      ) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "MARGIN_MODE_OBSERVED",
            confidence: "CONFIRMED",
            symbol,
            summary: `Margin mode ${a.marginMode} → ${b.marginMode} on ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }
      if (
        a.leverage != null &&
        b.leverage != null &&
        Math.abs(a.leverage - b.leverage) > 1e-8
      ) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "LEVERAGE_OBSERVED",
            confidence: "CONFIRMED",
            symbol,
            summary: `Leverage ${a.leverage} → ${b.leverage} on ${symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }
    }
  }

  const prevOrders = new Map(previous.openOrders.map((o) => [orderKey(o), o]));
  const curOrders = new Map(current.openOrders.map((o) => [orderKey(o), o]));
  const allOrderKeys = new Set([
    ...Array.from(prevOrders.keys()),
    ...Array.from(curOrders.keys()),
  ]);

  for (const key of Array.from(allOrderKeys)) {
    const a = prevOrders.get(key);
    const b = curOrders.get(key);
    if (!a && b) {
      events.push(
        makeEvent({
          sequence: seq++,
          type: "ORDER_OPENED",
          confidence: "CONFIRMED",
          symbol: b.symbol,
          summary: `Open order appeared ${b.side} ${b.symbol}`,
          capturedAt,
          accountId,
          reconciliationVersion,
        }),
      );
    } else if (a && !b) {
      // Fill vs cancel: prefer fill evidence from recent fills
      const fillMatch = current.recentFills.some(
        (f) => f.orderRef === a.orderId || f.symbol === a.symbol,
      );
      if (fillMatch) {
        const conf: BingxEventConfidence =
          current.recentFills.some((f) => f.orderRef === a.orderId)
            ? "CONFIRMED"
            : "UNCERTAIN";
        if (conf === "UNCERTAIN") uncertain = true;
        events.push(
          makeEvent({
            sequence: seq++,
            type:
              a.status === "partially_filled"
                ? "ORDER_FILLED"
                : "ORDER_FILLED",
            confidence: conf,
            symbol: a.symbol,
            summary: `Order no longer open; fill evidence for ${a.symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      } else {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "ORDER_CANCELLED_EXTERNALLY",
            confidence: "DERIVED",
            symbol: a.symbol,
            summary: `Open order disappeared without confirmed fill ${a.symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }
    } else if (a && b) {
      if (
        a.status !== "partially_filled" &&
        b.status === "partially_filled"
      ) {
        events.push(
          makeEvent({
            sequence: seq++,
            type: "ORDER_PARTIALLY_FILLED",
            confidence: "CONFIRMED",
            symbol: b.symbol,
            summary: `Order partially filled ${b.symbol}`,
            capturedAt,
            accountId,
            reconciliationVersion,
          }),
        );
      }
    }
  }

  // New fills since previous — do not equate fill with intention
  const prevFillIds = new Set(previous.recentFills.map((f) => f.fillId));
  for (const f of current.recentFills) {
    if (prevFillIds.has(f.fillId)) continue;
    // Fill alone does not emit POSITION_* — position diffs own that.
    notes.push(`New fill observed ${f.symbol} (not treated as intention).`);
  }

  if (
    current.completeness === "DEGRADED" ||
    current.completeness === "PARTIAL"
  ) {
    uncertain = true;
    events.push(
      makeEvent({
        sequence: seq++,
        type: "ACCOUNT_STATE_UNCERTAIN",
        confidence: "UNCERTAIN",
        summary: `Account completeness ${current.completeness}`,
        capturedAt,
        accountId,
        reconciliationVersion,
      }),
    );
  }

  return {
    version: reconciliationVersion,
    previousCapturedAt: previous.capturedAt,
    currentCapturedAt: capturedAt,
    events,
    uncertain,
    notes,
  };
}
