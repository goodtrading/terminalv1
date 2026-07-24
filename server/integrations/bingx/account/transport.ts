import {
  appendSignature,
  estimateClockDriftFromMessage,
  type BingxParamValue,
} from "./signer";
import { isPrivateReadAllowed } from "./allowlist";
import { assertPrivateReadOnlyTransport } from "./writeGuard";
import {
  BingxAccountError,
  BINGX_WRITE_OPERATION_BLOCKED,
  mapTransportError,
} from "./errors";
import { getBingxRequestTimeoutMs } from "./flags";
import { incrBingxCounter } from "./metrics";
import { logBingxAccount } from "./observability";

const DEFAULT_BASE = "https://open-api.bingx.com";

export type BingxTransportCredentials = {
  apiKey: string;
  apiSecret: string;
};

type QueueItem = {
  run: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
};

let active = 0;
const MAX_CONCURRENT = 2;
const queue: QueueItem[] = [];

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const item = queue.shift()!;
    active += 1;
    item
      .run()
      .then(item.resolve, item.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: run as () => Promise<unknown>,
      resolve: resolve as (v: unknown) => void,
      reject,
    });
    pump();
  });
}

function getBaseUrl(): string {
  return (process.env.BINGX_API_BASE_URL?.trim() || DEFAULT_BASE).replace(
    /\/$/,
    "",
  );
}

function parseBody(text: string): { code: number; msg?: string; data?: unknown } {
  try {
    return JSON.parse(text) as { code: number; msg?: string; data?: unknown };
  } catch {
    throw new BingxAccountError("Invalid JSON from BingX", "BINGX_PARSE_ERROR");
  }
}

export class BingxAccountTransport {
  private lastClockDriftMs: number | undefined;
  private readonly baseUrl: string;

  constructor(private readonly credentials: BingxTransportCredentials) {
    this.baseUrl = getBaseUrl();
  }

  getLastClockDriftMs(): number | undefined {
    return this.lastClockDriftMs;
  }

  /** Only allowlisted PRIVATE_READ GET. Writes throw BINGX_WRITE_OPERATION_BLOCKED. */
  async privateGet<T>(
    path: string,
    params: Record<string, BingxParamValue> = {},
  ): Promise<T> {
    assertPrivateReadOnlyTransport("GET", path);
    if (!isPrivateReadAllowed("GET", path)) {
      throw new BingxAccountError(
        `Endpoint not on PRIVATE_READ allowlist: GET ${path}`,
        "BINGX_ENDPOINT_NOT_ALLOWLISTED",
      );
    }

    return enqueue(() => this.doGet<T>(path, params));
  }

  /** Explicitly blocked — any call throws. */
  async privateWrite(
    method: string,
    path: string,
    _params?: Record<string, BingxParamValue>,
  ): Promise<never> {
    incrBingxCounter("write_blocked");
    assertPrivateReadOnlyTransport(method, path);
    throw new BingxAccountError(
      `Write blocked: ${method} ${path}`,
      BINGX_WRITE_OPERATION_BLOCKED,
    );
  }

  private async doGet<T>(
    path: string,
    params: Record<string, BingxParamValue>,
  ): Promise<T> {
    const { query, timestamp } = appendSignature(
      params,
      this.credentials.apiSecret,
    );
    const url = `${this.baseUrl}${path}?${query}`;
    const timeoutMs = getBingxRequestTimeoutMs();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    logBingxAccount("request", {
      method: "GET",
      path,
      timestamp,
      timeoutMs,
    });

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { "X-BX-APIKEY": this.credentials.apiKey },
        signal: controller.signal,
      });
      const text = await res.text();
      const json = parseBody(text);

      if (res.status === 429 || json.code === 100410 || json.code === 100419) {
        incrBingxCounter("rate_limit_errors");
        throw new BingxAccountError(
          json.msg || "Rate limited",
          "BINGX_RATE_LIMITED",
          429,
          true,
        );
      }

      if (!res.ok || json.code !== 0) {
        const msg = json.msg || `HTTP ${res.status}`;
        const drift = estimateClockDriftFromMessage(msg);
        if (drift != null) {
          this.lastClockDriftMs = drift;
          incrBingxCounter("clock_drift_errors");
          throw new BingxAccountError(msg, "BINGX_CLOCK_DRIFT", res.status, true);
        }
        if (/sign/i.test(msg) || json.code === 100001 || json.code === 100419) {
          incrBingxCounter("signature_errors");
          throw new BingxAccountError(msg, "BINGX_SIGNATURE_ERROR", res.status, false);
        }
        if (res.status === 401 || res.status === 403) {
          throw new BingxAccountError(msg, "BINGX_ACCOUNT_UNAUTHORIZED", res.status, false);
        }
        throw new BingxAccountError(
          msg,
          "BINGX_TRANSPORT_ERROR",
          res.status,
          true,
        );
      }

      return json.data as T;
    } catch (err) {
      if (err instanceof BingxAccountError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new BingxAccountError("BingX request timed out", "BINGX_TIMEOUT", undefined, true);
      }
      throw mapTransportError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Bounded backoff for retryable errors. Never retries signature errors.
 */
export async function withBoundedBackoff<T>(
  fn: () => Promise<T>,
  opts: { maxAttempts?: number; baseMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const baseMs = opts.baseMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (
        err instanceof BingxAccountError &&
        (!err.retryable || err.code === "BINGX_SIGNATURE_ERROR")
      ) {
        throw err;
      }
      if (attempt >= maxAttempts) break;
      await new Promise((r) => setTimeout(r, baseMs * attempt));
    }
  }
  throw lastErr;
}
