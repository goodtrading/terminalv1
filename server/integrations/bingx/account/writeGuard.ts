import { isBingxReadOnlyMode } from "./flags";
import {
  BingxAccountError,
  BINGX_WRITE_OPERATION_BLOCKED,
} from "./errors";
import { isPrivateWriteEndpoint } from "./allowlist";

const WRITE_ACTIONS = new Set([
  "place_order",
  "cancel_order",
  "amend_order",
  "close_position",
  "set_leverage",
  "set_margin_mode",
  "transfer",
  "withdraw",
  "submit_order",
  "modify_order",
]);

/**
 * Hard write guard. Default BINGX_READ_ONLY_MODE=true.
 * Throws BINGX_WRITE_OPERATION_BLOCKED for any write attempt.
 */
export function assertBingxWriteAllowed(
  actionOrMethod: string,
  path?: string,
): void {
  if (!isBingxReadOnlyMode()) {
    // Even if mode flag is off, account adapter still refuses known write endpoints.
    if (path && isPrivateWriteEndpoint(actionOrMethod, path)) {
      throw new BingxAccountError(
        "BingX write endpoint blocked by account adapter allowlist",
        BINGX_WRITE_OPERATION_BLOCKED,
      );
    }
    return;
  }

  const method = actionOrMethod.toUpperCase();
  if (path && isPrivateWriteEndpoint(method, path)) {
    throw new BingxAccountError(
      `Blocked BingX write: ${method} ${path}`,
      BINGX_WRITE_OPERATION_BLOCKED,
    );
  }

  if (WRITE_ACTIONS.has(actionOrMethod.toLowerCase())) {
    throw new BingxAccountError(
      `Blocked BingX write action: ${actionOrMethod}`,
      BINGX_WRITE_OPERATION_BLOCKED,
    );
  }

  if (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH") {
    if (
      path &&
      (/\/trade\//.test(path) ||
        /\/capital\//.test(path) ||
        /withdraw/i.test(path) ||
        /leverage/i.test(path) ||
        /margin/i.test(path))
    ) {
      throw new BingxAccountError(
        `Blocked BingX write: ${method} ${path}`,
        BINGX_WRITE_OPERATION_BLOCKED,
      );
    }
  }
}

/** Central write-block entrypoint (compat alias for regression tests). */
export function assertBingxWriteBlocked(
  actionOrMethod: string,
  path?: string,
): void {
  assertBingxWriteAllowed(actionOrMethod, path);
}

export function assertPrivateReadOnlyTransport(
  method: string,
  path: string,
): void {
  assertBingxWriteAllowed(method, path);
  if (method.toUpperCase() !== "GET") {
    throw new BingxAccountError(
      `Account adapter only permits GET; refused ${method} ${path}`,
      BINGX_WRITE_OPERATION_BLOCKED,
    );
  }
}
