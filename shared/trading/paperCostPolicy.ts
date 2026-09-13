import definition from "./paperCostPolicy.json";
export type PaperCostPolicy = Readonly<{ id: "DEFAULT_ZERO"; makerFeeBps: number; takerFeeBps: number; slippageBps: number }>;
if (definition.id !== "DEFAULT_ZERO" || [definition.makerFeeBps, definition.takerFeeBps, definition.slippageBps].some(value => value !== 0)) throw new Error("Invalid DEFAULT_ZERO Paper cost policy");
/** Shared data definition is also packaged verbatim for the Nautilus adapter. */
export const PAPER_COST_POLICY: PaperCostPolicy = Object.freeze({ ...definition, id: "DEFAULT_ZERO" });
