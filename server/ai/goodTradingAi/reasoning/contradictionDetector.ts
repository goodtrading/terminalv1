import { normalizeQuery } from "../knowledge/retrieve";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import { knowledgeRegistry } from "../knowledge/registry";

export type ContradictionFinding = {
  code: string;
  message: string;
  knowledgeIds: string[];
};

const BUY_HARD =
  /\b(buy hard|compra fuerte|compr[aá] ya|all[- ]?in long|long agresivo|vende fuerte|sell hard|short agresivo)\b/i;

/**
 * Detect methodological conflicts in question + retrieved entries.
 * Never assumes trade direction — only educational conflict messaging.
 */
export function detectReasoningContradictions(params: {
  message: string;
  entries: GoodTradingKnowledgeEntry[];
}): ContradictionFinding[] {
  const findings: ContradictionFinding[] = [];
  const q = normalizeQuery(params.message);
  const ids = new Set(params.entries.map((e) => e.id));
  const concepts = new Set(
    params.entries.flatMap((e) => [...e.concepts, ...e.aliases].map((c) => normalizeQuery(c))),
  );

  const hasPositiveGamma =
    concepts.has("positive gamma") ||
    concepts.has("gamma positiva") ||
    concepts.has("long gamma") ||
    /gamma positiva|positive gamma|long gamma/.test(q);
  const hasBearishFlip =
    /flip bajista|bearish flip|short gamma|gamma negativa|negative gamma/.test(q) ||
    (ids.has("gt_gamma_flip_zone") && /bajista|bearish|short/.test(q));
  const hasBuyHard = BUY_HARD.test(params.message) || /compra ahora|buy now/.test(q);

  if (hasPositiveGamma && hasBearishFlip && hasBuyHard) {
    findings.push({
      code: "GAMMA_FLIP_DIRECTION_CONFLICT",
      message:
        "Conflicto metodológico: mezclar gamma positiva, un flip con sesgo bajista y una orden tipo 'buy hard' no es coherente. El Mentor no asume dirección; primero reconciliá régimen, escala (Global vs Local) y evidencia de order flow.",
      knowledgeIds: ["gt_gamma_pos_neg_hypothesis", "gt_gamma_flip_zone", "gt_gamma_anti_binary"].filter(
        (id) => knowledgeRegistry.getById(id),
      ),
    });
  } else if ((hasPositiveGamma || hasBearishFlip) && hasBuyHard) {
    findings.push({
      code: "REGIME_PLUS_ORDER_CONFLICT",
      message:
        "Hay tensión entre un marco de régimen (gamma/flip) y un mandato direccional agresivo. En metodología GoodTrading el régimen no autoriza 'buy/sell hard'.",
      knowledgeIds: params.entries
        .filter((e) => e.category === "gamma" || e.category === "constitution")
        .map((e) => e.id)
        .slice(0, 4),
    });
  }

  const hasWall = ids.has("gt_liq_wall_not_reversal") || concepts.has("call wall") || concepts.has("put wall");
  const wallAsReversal = /wall confirma reversi|wall = revers|wall garantiza/.test(q);
  if (hasWall && wallAsReversal) {
    findings.push({
      code: "WALL_REVERSAL_CONFLICT",
      message:
        "Conflicto: una wall es referencia de liquidez/exposición, no confirmación automática de reversión.",
      knowledgeIds: ["gt_liq_wall_not_reversal", "gt_gamma_walls_reference"].filter((id) =>
        knowledgeRegistry.getById(id),
      ),
    });
  }

  const hasAbsorption = ids.has("gt_of_absorption_central") || concepts.has("absorption");
  const deltaAlone = /solo (con )?delta|delta alcanza|delta basta/.test(q);
  if (hasAbsorption && deltaAlone) {
    findings.push({
      code: "ABSORPTION_VS_DELTA",
      message:
        "Conflicto de prioridad: absorption se valida con pasivo/agresivo y acceptance; el delta solo no confirma la lectura.",
      knowledgeIds: ["gt_of_absorption_central", "gt_of_delta_not_signal"].filter((id) =>
        knowledgeRegistry.getById(id),
      ),
    });
  }

  // Explicit typed contradicts among retrieved nodes
  for (const e of params.entries) {
    for (const other of e.contradicts ?? []) {
      if (ids.has(other)) {
        const o = knowledgeRegistry.getById(other);
        findings.push({
          code: "TYPED_CONTRADICTION",
          message: `Tensión tipada entre «${e.title}» y «${o?.title ?? other}»: no combines sus lecturas como si fueran la misma señal.`,
          knowledgeIds: [e.id, other],
        });
      }
    }
  }

  // Dedupe by code
  const seen = new Set<string>();
  return findings.filter((f) => {
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });
}
