/**
 * Explicit BingX endpoint classification + PRIVATE_READ allowlist (AI-8.0).
 * Write paths are never allowlisted for the account adapter transport.
 */

export type BingxEndpointClass =
  | "PUBLIC_MARKET"
  | "PRIVATE_READ"
  | "PRIVATE_WRITE";

export type BingxAllowlistEntry = {
  path: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  classification: BingxEndpointClass;
  purpose: string;
};

/** Known public / market endpoints (not used by private account adapter). */
export const BINGX_PUBLIC_MARKET_ENDPOINTS: BingxAllowlistEntry[] = [
  {
    path: "/openApi/swap/v2/quote/contracts",
    method: "GET",
    classification: "PUBLIC_MARKET",
    purpose: "contract metadata",
  },
  {
    path: "/openApi/swap/v2/quote/ticker",
    method: "GET",
    classification: "PUBLIC_MARKET",
    purpose: "ticker",
  },
];

/** PRIVATE_READ allowlist — only these may be called by the account adapter. */
export const BINGX_PRIVATE_READ_ALLOWLIST: BingxAllowlistEntry[] = [
  {
    path: "/openApi/swap/v3/user/balance",
    method: "GET",
    classification: "PRIVATE_READ",
    purpose: "account balance",
  },
  {
    path: "/openApi/swap/v2/user/positions",
    method: "GET",
    classification: "PRIVATE_READ",
    purpose: "positions",
  },
  {
    path: "/openApi/swap/v2/trade/openOrders",
    method: "GET",
    classification: "PRIVATE_READ",
    purpose: "open orders",
  },
  {
    path: "/openApi/swap/v2/trade/allOrders",
    method: "GET",
    classification: "PRIVATE_READ",
    purpose: "order history",
  },
  {
    path: "/openApi/swap/v2/trade/allFillOrders",
    method: "GET",
    classification: "PRIVATE_READ",
    purpose: "fills / trade history",
  },
  {
    path: "/openApi/swap/v2/user/income",
    method: "GET",
    classification: "PRIVATE_READ",
    purpose: "income / commission context",
  },
];

/** Documented PRIVATE_WRITE surfaces — blocked by write guard. */
export const BINGX_PRIVATE_WRITE_ENDPOINTS: BingxAllowlistEntry[] = [
  {
    path: "/openApi/swap/v2/trade/order",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "place order",
  },
  {
    path: "/openApi/swap/v2/trade/order",
    method: "DELETE",
    classification: "PRIVATE_WRITE",
    purpose: "cancel order",
  },
  {
    path: "/openApi/swap/v2/trade/batchOrders",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "batch place",
  },
  {
    path: "/openApi/swap/v2/trade/allOpenOrders",
    method: "DELETE",
    classification: "PRIVATE_WRITE",
    purpose: "cancel all open",
  },
  {
    path: "/openApi/swap/v2/trade/leverage",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "set leverage",
  },
  {
    path: "/openApi/swap/v2/trade/marginType",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "set margin mode",
  },
  {
    path: "/openApi/swap/v2/trade/positionMargin",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "adjust margin",
  },
  {
    path: "/openApi/swap/v2/trade/closeAllPositions",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "close positions",
  },
  {
    path: "/openApi/wallets/v1/capital/withdraw/apply",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "withdraw",
  },
  {
    path: "/openApi/wallets/v1/capital/transfer",
    method: "POST",
    classification: "PRIVATE_WRITE",
    purpose: "transfer",
  },
];

const privateReadKey = (method: string, path: string) =>
  `${method.toUpperCase()} ${path}`;

const PRIVATE_READ_SET = new Set(
  BINGX_PRIVATE_READ_ALLOWLIST.map((e) => privateReadKey(e.method, e.path)),
);

const PRIVATE_WRITE_SET = new Set(
  BINGX_PRIVATE_WRITE_ENDPOINTS.map((e) => privateReadKey(e.method, e.path)),
);

export function classifyBingxEndpoint(
  method: string,
  path: string,
): BingxEndpointClass | "UNKNOWN" {
  const key = privateReadKey(method, path);
  if (PRIVATE_READ_SET.has(key)) return "PRIVATE_READ";
  if (PRIVATE_WRITE_SET.has(key)) return "PRIVATE_WRITE";
  const pub = BINGX_PUBLIC_MARKET_ENDPOINTS.find(
    (e) => e.path === path && e.method === method.toUpperCase(),
  );
  if (pub) return "PUBLIC_MARKET";
  // Heuristic: POST/PUT/DELETE to trade/wallet paths are write
  const m = method.toUpperCase();
  if (
    (m === "POST" || m === "PUT" || m === "DELETE") &&
    (/\/trade\//.test(path) || /\/capital\//.test(path) || /\/withdraw/.test(path))
  ) {
    return "PRIVATE_WRITE";
  }
  return "UNKNOWN";
}

export function isPrivateReadAllowed(method: string, path: string): boolean {
  return PRIVATE_READ_SET.has(privateReadKey(method, path));
}

export function isPrivateWriteEndpoint(method: string, path: string): boolean {
  return classifyBingxEndpoint(method, path) === "PRIVATE_WRITE";
}

export const BINGX_PATHS = {
  BALANCE: "/openApi/swap/v3/user/balance",
  POSITIONS: "/openApi/swap/v2/user/positions",
  OPEN_ORDERS: "/openApi/swap/v2/trade/openOrders",
  ALL_ORDERS: "/openApi/swap/v2/trade/allOrders",
  ALL_FILLS: "/openApi/swap/v2/trade/allFillOrders",
  INCOME: "/openApi/swap/v2/user/income",
} as const;
