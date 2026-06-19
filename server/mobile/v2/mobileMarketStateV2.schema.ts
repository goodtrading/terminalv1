import { z } from "zod";
import { SUPPORTED_ASSETS } from "./mobileMarketStateV2.types";

export const mobileMarketStateV2QuerySchema = z.object({
  asset: z
    .string()
    .trim()
    .toUpperCase()
    .default("BTC"),
  mode: z.enum(["micro", "macro", "both"]),
});

export type MobileMarketStateV2Query = z.infer<typeof mobileMarketStateV2QuerySchema>;

export function parseMobileMarketStateV2Query(
  query: Record<string, unknown>,
):
  | { ok: true; value: MobileMarketStateV2Query }
  | { ok: false; error: "INVALID_MODE" | "UNSUPPORTED_ASSET"; details?: unknown } {
  const modeRaw = query.mode;
  if (modeRaw != null && typeof modeRaw === "string") {
    const mode = modeRaw.trim().toLowerCase();
    if (mode !== "micro" && mode !== "macro" && mode !== "both") {
      return { ok: false, error: "INVALID_MODE" };
    }
  }

  const assetRaw =
    typeof query.asset === "string" && query.asset.trim()
      ? query.asset.trim().toUpperCase()
      : "BTC";

  if (!SUPPORTED_ASSETS.includes(assetRaw as (typeof SUPPORTED_ASSETS)[number])) {
    return { ok: false, error: "UNSUPPORTED_ASSET" };
  }

  const parsed = mobileMarketStateV2QuerySchema.safeParse({
    asset: assetRaw,
    mode: typeof modeRaw === "string" ? modeRaw.trim().toLowerCase() : modeRaw,
  });

  if (!parsed.success) {
    const modeIssue = parsed.error.issues.find((i) => i.path[0] === "mode");
    if (modeIssue) return { ok: false, error: "INVALID_MODE", details: parsed.error.flatten() };
    return { ok: false, error: "INVALID_MODE", details: parsed.error.flatten() };
  }

  return { ok: true, value: parsed.data };
}
