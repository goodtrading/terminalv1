import type { LiveOrderPreviewResult } from "./liveOrderPreviewTypes";
import type { LiveTradingReadiness } from "../health/liveTradingReadinessTypes";
import { LIVE_LIMIT_CONFIRMATION_TEXT } from "./liveOrderSubmitTypes";

export type LiveSubmitUiState = {
  canSubmit: boolean;
  statusLabel: string;
  lockReason: string | null;
};

type ResolveArgs = {
  orderType: "market" | "limit";
  preview: LiveOrderPreviewResult | null;
  readiness: LiveTradingReadiness | null;
  confirmationText: string;
  stopLossInput: string;
  limitPriceInput: string;
  submitBusy: boolean;
};

export function resolveLiveSubmitUiState(args: ResolveArgs): LiveSubmitUiState {
  const {
    orderType,
    preview,
    readiness,
    confirmationText,
    stopLossInput,
    limitPriceInput,
    submitBusy,
  } = args;

  if (orderType !== "limit") {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: "Market orders disabled — use limit only",
    };
  }

  if (!preview || preview.blocked || !preview.validated) {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: preview?.blocked
        ? "Preview blocked — fix blockers first"
        : "Run a valid limit preview first",
    };
  }

  if (preview.type !== "limit") {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: "Preview must be limit type",
    };
  }

  if (!preview.risk.hasStopLoss && !stopLossInput.trim()) {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: "Stop loss required",
    };
  }

  if (!limitPriceInput.trim()) {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: "Limit price required",
    };
  }

  if (readiness?.killSwitchActive) {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: "Kill switch active",
    };
  }

  if (
    readiness?.status !== "ready_for_live" ||
    readiness?.readyForLive !== true
  ) {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: "Readiness not ready_for_live",
    };
  }

  if (confirmationText.trim() !== LIVE_LIMIT_CONFIRMATION_TEXT) {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: `Type exactly: ${LIVE_LIMIT_CONFIRMATION_TEXT}`,
    };
  }

  if (submitBusy) {
    return {
      canSubmit: false,
      statusLabel: "LIVE SUBMIT LOCKED",
      lockReason: "Submit in progress",
    };
  }

  return {
    canSubmit: true,
    statusLabel: "READY FOR LIVE LIMIT",
    lockReason: null,
  };
}
