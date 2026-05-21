import { appendSignature, type BingXParamValue } from "./bingxSigner";
import type { BingXApiCredentials } from "./bingxTypes";

const DEFAULT_BASE = "https://open-api.bingx.com";
const REQUEST_TIMEOUT_MS = 12_000;

export class BingXApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "BingXApiError";
  }
}

function getBaseUrl(): string {
  return (process.env.BINGX_API_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/$/, "");
}

function parseBingXBody(text: string): { code: number; msg?: string; data?: unknown } {
  try {
    return JSON.parse(text) as { code: number; msg?: string; data?: unknown };
  } catch {
    throw new BingXApiError("Invalid JSON response from BingX", "BINGX_PARSE_ERROR");
  }
}

export class BingXHttpClient {
  private readonly baseUrl: string;

  constructor(private readonly credentials: BingXApiCredentials) {
    this.baseUrl = getBaseUrl();
  }

  async signedGet<T>(path: string, params: Record<string, BingXParamValue> = {}): Promise<T> {
    const signed = appendSignature(params, this.credentials.apiSecret);
    const url = `${this.baseUrl}${path}?${signed}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "X-BX-APIKEY": this.credentials.apiKey,
        },
        signal: controller.signal,
      });

      const text = await res.text();
      const json = parseBingXBody(text);

      if (!res.ok) {
        throw new BingXApiError(
          json.msg || `HTTP ${res.status}`,
          "BINGX_HTTP_ERROR",
          res.status,
        );
      }

      if (json.code !== 0) {
        throw new BingXApiError(
          json.msg || `BingX error code ${json.code}`,
          `BINGX_${json.code}`,
          res.status,
        );
      }

      return json.data as T;
    } catch (err) {
      if (err instanceof BingXApiError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new BingXApiError("BingX request timed out", "BINGX_TIMEOUT");
      }
      const msg = err instanceof Error ? err.message : "Unknown BingX error";
      throw new BingXApiError(msg, "BINGX_REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }

  async signedPost<T>(
    path: string,
    params: Record<string, BingXParamValue> = {},
  ): Promise<T> {
    const signed = appendSignature(params, this.credentials.apiSecret);
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "X-BX-APIKEY": this.credentials.apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: signed,
        signal: controller.signal,
      });

      const text = await res.text();
      const json = parseBingXBody(text);

      if (!res.ok || json.code !== 0) {
        throw new BingXApiError(
          json.msg || `HTTP ${res.status}`,
          json.code != null ? `BINGX_${json.code}` : "BINGX_HTTP_ERROR",
          res.status,
        );
      }

      return json.data as T;
    } catch (err) {
      if (err instanceof BingXApiError) throw err;
      const msg = err instanceof Error ? err.message : "Unknown BingX error";
      throw new BingXApiError(msg, "BINGX_REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }
}
