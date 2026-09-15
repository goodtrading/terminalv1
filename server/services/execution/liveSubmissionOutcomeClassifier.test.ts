import assert from "node:assert/strict";
import { test } from "node:test";
import { BingXApiError } from "../exchanges/bingx/bingxHttpClient";
import { classifyLiveSubmissionError } from "./liveSubmissionOutcomeClassifier";

test("classifies every post-dispatch error as transport UNKNOWN", () => {
  const cases = [
    new BingXApiError("timeout", "BINGX_TIMEOUT"),
    new BingXApiError("http failure", "BINGX_HTTP_ERROR", 500),
    new BingXApiError("api failure", "BINGX_100400", 400),
    new BingXApiError("malformed", "BINGX_PARSE_ERROR"),
    new Error("connection reset"),
  ];
  for (const error of cases) {
    const outcome = classifyLiveSubmissionError(error);
    assert.equal(outcome.kind, "UNKNOWN");
    assert.notEqual(outcome.errorCode, undefined);
    assert.notEqual(outcome.errorClass, undefined);
  }
});
