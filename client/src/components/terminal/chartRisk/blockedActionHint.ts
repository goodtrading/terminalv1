export type BlockedRealActionKind = "close" | "add_sl" | "add_tp";

const HINT_MESSAGES: Record<BlockedRealActionKind, string> = {
  close: "Real close is locked. Live trading is disabled.",
  add_sl: "Adding real stop loss from GoodTrading is locked in this build.",
  add_tp: "Adding real take profit from GoodTrading is locked in this build.",
};

export function blockedActionHintMessage(action: BlockedRealActionKind): string {
  return HINT_MESSAGES[action];
}

/** Tooltip/title for locked control buttons. */
export function blockedActionControlTitle(action: BlockedRealActionKind): string {
  return blockedActionHintMessage(action);
}
