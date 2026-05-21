/** Dev-only BingX loading diagnostics (no secrets). */

export type BingXLoadingDebugPayload = {
  apiLoading?: boolean;
  restoreLoading?: boolean;
  loginStatusLoading?: boolean;
  connectionStatus: string;
  brokerStatus: string;
  authReady: boolean;
  hasUser: boolean;
  requestInFlight: boolean;
  lastAction: string;
};

export function logBingXLoadingState(payload: BingXLoadingDebugPayload): void {
  if (import.meta.env.PROD) return;
  console.debug("[BingX Loading State]", payload);
}
