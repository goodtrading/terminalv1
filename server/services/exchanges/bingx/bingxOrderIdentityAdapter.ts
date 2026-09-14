import { createOrderIdentity, type OrderIdentity } from "../../../../shared/orderLifecycle";
import type { AccountIdentity } from "../../../../shared/portfolioState";
import type { ExecutionMarketIdentity } from "../../../../shared/marketTruth";

export const BINGX_BROKER_ORDER_ID_POLICY = "BINGX_BROKER_ORDER_ID_V1";

export type BingXOrderIdentityResult = Readonly<{
  ok: true;
  identity: OrderIdentity;
  provenance: Readonly<{
    source: "BINGX_ACCOUNT_READ_ONLY";
    broker: "BINGX";
    environment: "LIVE";
    accountId: string;
    marketIdentity: ExecutionMarketIdentity;
    brokerOrderId: string;
    canonicalOrderIdPolicy: typeof BINGX_BROKER_ORDER_ID_POLICY;
  }>;
}> | Readonly<{
  ok: false;
  code:
    | "BROKER_ORDER_ID_REQUIRED"
    | "ACCOUNT_SCOPE_INVALID"
    | "MARKET_SCOPE_INVALID";
  message: string;
}>;

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function sameAccount(a: AccountIdentity, b: AccountIdentity): boolean {
  return a.accountId === b.accountId
    && a.broker === b.broker
    && a.environment === b.environment
    && a.baseCurrency === b.baseCurrency
    && a.accountType === b.accountType;
}

function sameMarket(a: ExecutionMarketIdentity, b: ExecutionMarketIdentity): boolean {
  return a.instrument === b.instrument
    && a.venue === b.venue
    && a.marketType === b.marketType;
}

export function buildBingXOrderIdentity(input: Readonly<{
  account: AccountIdentity;
  market: ExecutionMarketIdentity;
  brokerOrderId: string | undefined;
  clientOrderId?: string;
}>): BingXOrderIdentityResult {
  const brokerOrderId = text(input.brokerOrderId);
  if (!brokerOrderId) return { ok: false, code: "BROKER_ORDER_ID_REQUIRED", message: "factual broker order ID is required" };
  if (input.account.broker !== "BINGX" || input.account.environment !== "LIVE") {
    return { ok: false, code: "ACCOUNT_SCOPE_INVALID", message: "BingX order identity requires LIVE BINGX account scope" };
  }
  if (input.market.venue !== "BINGX" || input.market.marketType !== "Perpetual") {
    return { ok: false, code: "MARKET_SCOPE_INVALID", message: "BingX Swap order identity requires explicit BINGX Perpetual market scope" };
  }
  const clientOrderId = text(input.clientOrderId);
  const identity = createOrderIdentity({
    account: input.account,
    market: input.market,
    canonicalOrderId: brokerOrderId,
    venueOrderId: brokerOrderId,
    ...(clientOrderId ? { clientOrderId } : {}),
  });
  return {
    ok: true,
    identity,
    provenance: {
      source: "BINGX_ACCOUNT_READ_ONLY",
      broker: "BINGX",
      environment: "LIVE",
      accountId: input.account.accountId,
      marketIdentity: input.market,
      brokerOrderId,
      canonicalOrderIdPolicy: BINGX_BROKER_ORDER_ID_POLICY,
    },
  };
}

export function orderScopesEqual(
  a: OrderIdentity,
  b: { accountIdentity: AccountIdentity; marketIdentity: ExecutionMarketIdentity },
): boolean {
  return sameAccount(a.account, b.accountIdentity) && sameMarket(a.market, b.marketIdentity);
}
