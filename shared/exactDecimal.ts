export type ExactDecimal = Readonly<{
  units: any;
  scale: number;
}>;

export const MAX_DECIMAL_SCALE = 18;
const MAX_ARITHMETIC_SCALE = 72;
const EXACT_DECIMAL = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

function bigInt(value: string | number): any {
  return (globalThis as any).BigInt(value);
}

function decimalText(value: string | number): string {
  const raw = String(value);
  if (!/[eE]/.test(raw)) return raw;
  return Number(value).toFixed(MAX_DECIMAL_SCALE).replace(/0+$/, "").replace(/\.$/, "");
}

function assertScale(scale: number, field: string): void {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > MAX_ARITHMETIC_SCALE) {
    throw new Error(`${field} exceeds supported decimal precision`);
  }
}

export function parseExactDecimal(value: string): ExactDecimal {
  if (typeof value !== "string" || !EXACT_DECIMAL.test(value)) throw new Error("value must be an exact decimal string");
  const [, fraction = ""] = value.split(".");
  if (fraction.length > MAX_DECIMAL_SCALE) throw new Error("value exceeds supported decimal precision");
  assertScale(fraction.length, "value");
  return { units: bigInt(value.replace(".", "")), scale: fraction.length };
}

/** Compatibility parser for the established N9B string|number input contract. */
export function parseDecimal(value: string | number): ExactDecimal {
  const text = decimalText(value);
  const parsed = parseExactDecimal(text);
  return parsed;
}

function align(a: ExactDecimal, b: ExactDecimal): [any, any, number] {
  const scale = Math.max(a.scale, b.scale);
  assertScale(scale, "aligned decimal");
  return [a.units * (bigInt(10) ** bigInt(scale - a.scale)), b.units * (bigInt(10) ** bigInt(scale - b.scale)), scale];
}

export function addExactDecimal(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const [x, y, scale] = align(a, b);
  return { units: x + y, scale };
}

export function multiplyExactDecimal(a: ExactDecimal, b: ExactDecimal): ExactDecimal {
  const scale = a.scale + b.scale;
  assertScale(scale, "multiplication result");
  return { units: a.units * b.units, scale };
}

/** Divide with an explicit number of fractional output places; truncates toward zero. */
export function divideExactDecimal(a: ExactDecimal, b: ExactDecimal, fractionalPlaces = MAX_DECIMAL_SCALE): ExactDecimal {
  assertScale(fractionalPlaces, "fractionalPlaces");
  if (b.units === bigInt(0)) throw new Error("decimal denominator must not be zero");
  const scale = a.scale + fractionalPlaces;
  assertScale(scale, "division result");
  return { units: (a.units * (bigInt(10) ** bigInt(fractionalPlaces + b.scale))) / b.units, scale };
}

export function serializeExactDecimal(value: ExactDecimal): string {
  assertScale(value.scale, "decimal");
  const negative = value.units < bigInt(0);
  const raw = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, "0");
  const whole = value.scale ? raw.slice(0, -value.scale) : raw;
  const fraction = value.scale ? raw.slice(-value.scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function zeroExactDecimal(): ExactDecimal {
  return { units: bigInt(0), scale: 0 };
}
