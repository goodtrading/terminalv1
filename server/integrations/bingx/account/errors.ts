export const BINGX_WRITE_OPERATION_BLOCKED = "BINGX_WRITE_OPERATION_BLOCKED";

export type BingxAccountErrorCode =
  | typeof BINGX_WRITE_OPERATION_BLOCKED
  | "BINGX_ACCOUNT_DISABLED"
  | "BINGX_ACCOUNT_NOT_CONFIGURED"
  | "BINGX_ACCOUNT_UNAUTHORIZED"
  | "BINGX_ENDPOINT_NOT_ALLOWLISTED"
  | "BINGX_SIGNATURE_ERROR"
  | "BINGX_CLOCK_DRIFT"
  | "BINGX_RATE_LIMITED"
  | "BINGX_TIMEOUT"
  | "BINGX_TRANSPORT_ERROR"
  | "BINGX_PARSE_ERROR"
  | "BINGX_PARTIAL_FETCH"
  | "BINGX_CONNECTION_NOT_FOUND"
  | "BINGX_ACCOUNT_ERROR";

export class BingxAccountError extends Error {
  constructor(
    message: string,
    public readonly code: BingxAccountErrorCode,
    public readonly httpStatus?: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "BingxAccountError";
  }

  toSafeClient(): { code: string; message: string } {
    return {
      code: this.code,
      message: sanitizeErrorMessage(this.code, this.message),
    };
  }
}

export function sanitizeErrorMessage(
  code: string,
  fallback = "BingX account request failed",
): string {
  switch (code) {
    case BINGX_WRITE_OPERATION_BLOCKED:
      return "BingX write operations are blocked in read-only mode.";
    case "BINGX_ACCOUNT_DISABLED":
      return "BingX account integration is disabled.";
    case "BINGX_ACCOUNT_NOT_CONFIGURED":
      return "BingX credentials are not configured.";
    case "BINGX_ACCOUNT_UNAUTHORIZED":
      return "BingX credentials were rejected or lack read permission.";
    case "BINGX_ENDPOINT_NOT_ALLOWLISTED":
      return "Requested BingX endpoint is not allowlisted for read-only use.";
    case "BINGX_SIGNATURE_ERROR":
      return "BingX signature validation failed.";
    case "BINGX_CLOCK_DRIFT":
      return "Server clock drift exceeds BingX recvWindow tolerance.";
    case "BINGX_RATE_LIMITED":
      return "BingX rate limit reached. Retry later.";
    case "BINGX_TIMEOUT":
      return "BingX request timed out.";
    case "BINGX_CONNECTION_NOT_FOUND":
      return "BingX connection not found for this user.";
    default:
      return fallback.length > 160 ? "BingX account request failed." : fallback;
  }
}

export function mapTransportError(err: unknown): BingxAccountError {
  if (err instanceof BingxAccountError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/signature|sign/i.test(msg)) {
    return new BingxAccountError(msg, "BINGX_SIGNATURE_ERROR", undefined, false);
  }
  if (/rate|429|too many/i.test(msg)) {
    return new BingxAccountError(msg, "BINGX_RATE_LIMITED", 429, true);
  }
  if (/abort|timeout/i.test(msg)) {
    return new BingxAccountError(msg, "BINGX_TIMEOUT", undefined, true);
  }
  return new BingxAccountError(msg, "BINGX_TRANSPORT_ERROR", undefined, true);
}
