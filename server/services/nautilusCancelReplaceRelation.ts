import { createOrderState, type OrderState } from "../../shared/orderLifecycle";

export type CancelReplaceEvidence = Readonly<{
  operation: "CANCEL_REPLACE";
  originalClientOrderId: string;
  replacementClientOrderId: string;
}>;

export type CancelReplaceRelationResult = Readonly<{
  original: OrderState;
  replacement: OrderState;
  evidence: CancelReplaceEvidence;
}>;

function clone<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, clone(item)])) as T;
}

function sameScope(a: OrderState, b: OrderState): boolean {
  return a.identity.account.accountId === b.identity.account.accountId
    && a.identity.account.broker === b.identity.account.broker
    && a.identity.account.environment === b.identity.account.environment
    && a.identity.market.instrument === b.identity.market.instrument
    && a.identity.market.venue === b.identity.market.venue
    && a.identity.market.marketType === b.identity.market.marketType;
}

export function linkCancelReplaceRelation(input: Readonly<{
  original: OrderState;
  replacement: OrderState;
  evidence: CancelReplaceEvidence;
}>): CancelReplaceRelationResult {
  if (!input?.original || !input.replacement || !input.evidence) throw new Error("original, replacement and evidence are required");
  if (input.evidence.operation !== "CANCEL_REPLACE") throw new Error("operation must be CANCEL_REPLACE");
  if (input.original.identity.canonicalOrderId === input.replacement.identity.canonicalOrderId) throw new Error("cancel-replace orders must have distinct canonical IDs");
  if (input.original.identity.clientOrderId === input.replacement.identity.clientOrderId) throw new Error("cancel-replace orders must have distinct client IDs");
  if (!sameScope(input.original, input.replacement)) throw new Error("cancel-replace orders must share account and market scope");
  if (input.original.identity.clientOrderId !== input.evidence.originalClientOrderId) throw new Error("original evidence reference mismatch");
  if (input.replacement.identity.clientOrderId !== input.evidence.replacementClientOrderId) throw new Error("replacement evidence reference mismatch");
  if (input.original.status !== "CANCELED") throw new Error("original order must be CANCELED");
  const original = createOrderState({
    ...clone(input.original),
    relationships: [...input.original.relationships, { relationType: "REPLACED_BY", canonicalOrderId: input.replacement.identity.canonicalOrderId }],
  });
  const replacement = createOrderState({
    ...clone(input.replacement),
    relationships: [...input.replacement.relationships, { relationType: "REPLACES", canonicalOrderId: input.original.identity.canonicalOrderId }],
  });
  return { original: clone(original), replacement: clone(replacement), evidence: clone(input.evidence) };
}
