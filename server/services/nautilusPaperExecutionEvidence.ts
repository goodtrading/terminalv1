export type NautilusPaperFillWire = Readonly<{
  fillId?: string;
  clientOrderId?: string;
  venueOrderId?: string | null;
  instrument?: Readonly<{ venue: string; marketType: string; symbol: string }>;
  side?: string;
  price?: string;
  quantity?: string;
  timestamp?: number;
  fee?: string | null;
  feeAsset?: string | null;
  liquidity?: string | null;
}>;

export type NautilusPaperExecutionEvidence = Readonly<{
  executionId: string;
  environment: "PAPER";
  source: "NAUTILUS_PAPER";
  side: "BUY" | "SELL";
  price: string;
  quantity: string;
  eventTime: number;
  fee: Readonly<{
    value: string | null;
    asset: string | null;
    quality: "SIMULATED_CONFIGURED_FEE";
  }>;
  liquidityRole: "MAKER" | "TAKER" | "UNKNOWN";
  orderReferences: Readonly<{
    clientOrderId: string;
    venueOrderId?: string;
  }>;
}>;

const EXACT_DECIMAL = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value;
}

function positiveDecimal(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!EXACT_DECIMAL.test(text) || /^0(?:\.0+)?$/.test(text)) {
    throw new Error(`${field} must be a positive exact decimal string`);
  }
  return text;
}

function optionalFee(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !EXACT_DECIMAL.test(value)) throw new Error("fee must be an exact decimal string or null");
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === null || value === undefined) return undefined;
  return requiredText(value, field);
}

export function adaptNautilusPaperExecutionEvidence(
  input: NautilusPaperFillWire,
): NautilusPaperExecutionEvidence {
  const executionId = requiredText(input.fillId, "fillId");
  const clientOrderId = requiredText(input.clientOrderId, "clientOrderId");
  const instrument = input.instrument;
  if (!instrument || typeof instrument !== "object") throw new Error("instrument is required");
  requiredText(instrument.venue, "instrument.venue");
  requiredText(instrument.marketType, "instrument.marketType");
  requiredText(instrument.symbol, "instrument.symbol");
  if (input.side !== "BUY" && input.side !== "SELL") throw new Error("side must be BUY or SELL");
  const timestamp = input.timestamp;
  if (timestamp === undefined || !Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error("timestamp must be a non-negative integer milliseconds value");
  const eventTime = timestamp as number;
  const liquidity = input.liquidity?.toUpperCase();
  return {
    executionId,
    environment: "PAPER",
    source: "NAUTILUS_PAPER",
    side: input.side,
    price: positiveDecimal(input.price, "price"),
    quantity: positiveDecimal(input.quantity, "quantity"),
    eventTime,
    fee: { value: optionalFee(input.fee), asset: optionalText(input.feeAsset, "feeAsset") ?? null, quality: "SIMULATED_CONFIGURED_FEE" },
    liquidityRole: liquidity === "MAKER" || liquidity === "TAKER" ? liquidity : "UNKNOWN",
    orderReferences: {
      clientOrderId,
      ...(input.venueOrderId == null ? {} : { venueOrderId: requiredText(input.venueOrderId, "venueOrderId") }),
    },
  };
}
