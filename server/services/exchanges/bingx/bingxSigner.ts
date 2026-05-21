import crypto from "crypto";

export type BingXParamValue = string | number | boolean | undefined;

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "****";
  const head = trimmed.slice(0, 6);
  const tail = trimmed.slice(-4);
  return `${head}****${tail}`;
}

/** Sort keys ASCII, join key=value (values not URL-encoded before sign). */
export function buildSignedQuery(
  params: Record<string, BingXParamValue>,
): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return entries.map(([k, v]) => `${k}=${v}`).join("&");
}

export function signBingXQuery(queryString: string, apiSecret: string): string {
  return crypto.createHmac("sha256", apiSecret).update(queryString).digest("hex");
}

export function appendSignature(
  params: Record<string, BingXParamValue>,
  apiSecret: string,
): string {
  const timestamp = Date.now();
  const withTime: Record<string, BingXParamValue> = {
    ...params,
    timestamp,
    recvWindow: params.recvWindow ?? 5000,
  };
  const qs = buildSignedQuery(withTime);
  const signature = signBingXQuery(qs, apiSecret);
  return `${qs}&signature=${signature}`;
}
