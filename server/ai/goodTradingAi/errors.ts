import {
  AI_ERROR_HTTP_STATUS,
  SAFE_AI_ERROR_MESSAGES,
  type GoodTradingAIErrorBody,
  type GoodTradingAIErrorCode,
} from "@shared/goodTradingAi";

export class GoodTradingAIError extends Error {
  readonly code: GoodTradingAIErrorCode;
  readonly requestId?: string;
  readonly httpStatus: number;

  constructor(code: GoodTradingAIErrorCode, message?: string, requestId?: string) {
    super(message ?? SAFE_AI_ERROR_MESSAGES[code]);
    this.name = "GoodTradingAIError";
    this.code = code;
    this.requestId = requestId;
    this.httpStatus = AI_ERROR_HTTP_STATUS[code];
  }
}

export function toAiErrorBody(err: GoodTradingAIError): GoodTradingAIErrorBody {
  return {
    code: err.code,
    message: SAFE_AI_ERROR_MESSAGES[err.code],
    requestId: err.requestId,
    error: err.code,
  };
}
