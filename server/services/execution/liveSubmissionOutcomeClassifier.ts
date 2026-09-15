export type LiveSubmissionOutcome =
  | { kind: "RESPONSE_OBSERVED" }
  | {
      kind: "UNKNOWN";
      errorCode: string;
      errorClass: string;
      message: string;
      httpStatus?: number;
    };

export function classifyLiveSubmissionError(error: unknown): Extract<LiveSubmissionOutcome, { kind: "UNKNOWN" }> {
  const candidate = error as { code?: unknown; name?: unknown; message?: unknown; httpStatus?: unknown };
  const errorCode = typeof candidate?.code === "string" && candidate.code.trim()
    ? candidate.code
    : "BINGX_REQUEST_FAILED";
  const errorClass = typeof candidate?.name === "string" && candidate.name.trim()
    ? candidate.name
    : "Error";
  const message = typeof candidate?.message === "string" && candidate.message.trim()
    ? candidate.message.slice(0, 160)
    : "Exchange submit outcome is unknown";
  const httpStatus = typeof candidate?.httpStatus === "number" && Number.isInteger(candidate.httpStatus)
    ? candidate.httpStatus
    : undefined;
  return { kind: "UNKNOWN", errorCode, errorClass, message, ...(httpStatus === undefined ? {} : { httpStatus }) };
}

export function classifyLiveSubmissionResponse(): Extract<LiveSubmissionOutcome, { kind: "RESPONSE_OBSERVED" }> {
  return { kind: "RESPONSE_OBSERVED" };
}
