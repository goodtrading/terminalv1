import { setup, type GoodTradingSetup } from "./types";

export const SETUP_ENTRIES: readonly GoodTradingSetup[] = [
  setup({
    id: "gt_setup_sweep_reclaim",
    title: "Setup educativo: Sweep + Reclaim",
    concepts: ["setup sweep reclaim", "sweep reclaim setup"],
    aliases: ["barrido y reclaim"],
    hypothesis:
      "Tras un barrido de liquidez, si el precio reclama el nivel con acceptance, la continuación del barrido queda en duda.",
    statement: "Secuencia educativa sweep→reclaim con confirmaciones e invalidación explícitas.",
    explanation:
      "No es señal automática. Entrena a no operar el sweep solo y a exigir reclaim + fallo de continuación.",
    confirmations: [
      "Reclaim del nivel barrido",
      "Fallo de acceptance más allá del sweep",
      "Pasivo que comienza a defender el lado reclaim",
    ],
    invalidations: [
      "Nueva acceptance sostenida más allá del extremo del sweep",
      "Pulling inmediato del pasivo que 'defendía'",
    ],
    traps: [
      "Entrar en el primer tick del barrido",
      "Ignorar thin book / spike de noticia",
    ],
    managementNotes: [
      "Invalidación primero; tamaño reducido si la volatilidad es alta",
      "Parciales solo si el plan lo define, no por miedo",
    ],
    risks: ["Fake reclaim en sesión ilíquida"],
    examples: ["Barrido bajo un put-wall-referencia + reclaim y rotación — caso de estudio, no orden."],
    prohibitedInterpretations: ["Todo sweep+reclaim se opera"],
    relatedKnowledgeIds: [
      "gt_liq_sweep_reclaim",
      "gt_of_acceptance_rejection",
      "gt_risk_invalidation_first",
      "gt_const_hypothesis_not_certainty",
    ],
  }),
  setup({
    id: "gt_setup_absorption_fade",
    title: "Setup educativo: Absorption fade",
    concepts: ["setup absorption", "absorption fade"],
    aliases: ["fade absorción"],
    hypothesis:
      "Si agresores no logran progreso contra pasivo persistente en nivel clave, la presión puede rotar.",
    statement: "Fade educativo condicionado a absorption verificable e invalidación clara.",
    explanation:
      "Central en order flow GoodTrading. Sin persistencia del pasivo, no hay setup.",
    confirmations: [
      "Hits repetidos sin acceptance",
      "Reposición/persistencia pasiva",
      "Pérdida de velocidad del tape agresor",
    ],
    invalidations: ["Breakthrough con acceptance y pulling del pasivo"],
    traps: ["Etiquetar cualquier consolidación como absorption"],
    managementNotes: ["No promediar si falla; la invalidación termina la idea"],
    relatedKnowledgeIds: [
      "gt_of_absorption_central",
      "gt_liq_consumed_vs_defended",
      "gt_cross_delta_liquidity",
      "gt_risk_invalidation_first",
    ],
  }),
  setup({
    id: "gt_setup_flip_transition",
    title: "Setup educativo: Transición de Flip",
    concepts: ["setup flip", "flip transition"],
    aliases: ["transición régimen flip"],
    hypothesis:
      "La acceptance sostenida a un lado de la zona de flip puede coincidir con cambio de sesgo de régimen (hipótesis).",
    statement: "Estudio de transición alrededor del flip como zona, no como trigger de un tick.",
    explanation:
      "Se combina con order flow y liquidez. El cruce solo no basta.",
    confirmations: ["Acceptance en el lado nuevo", "Order flow de iniciativa alineado", "No retorno inmediato con acceptance opuesta"],
    invalidations: ["Rechazo rápido y acceptance de vuelta al lado previo"],
    traps: ["Comprar/vender el print exacto del flip"],
    managementNotes: ["Tratar como cambio de mapa, no como all-in"],
    relatedKnowledgeIds: [
      "gt_gamma_flip_zone",
      "gt_gamma_pos_neg_hypothesis",
      "gt_of_acceptance_rejection",
      "gt_const_levels_are_references",
    ],
  }),
  setup({
    id: "gt_setup_wall_rejection",
    title: "Setup educativo: Rechazo en wall-referencia",
    concepts: ["setup wall rejection", "wall rejection"],
    aliases: ["rechazo en wall"],
    hypothesis:
      "Si una wall-referencia persiste y el flujo rechaza con rejection clara, hay escenario de rotación educativa.",
    statement: "Rechazo en wall solo con evidencia de persistencia + rejection; wall sola no alcanza.",
    explanation:
      "Contrarresta el anti-patrón wall=reversión. Exige pulling check e invalidación por acceptance a través.",
    confirmations: ["Persistencia del pasivo", "Rejection/acceptance fallida", "Delta hostil absorbido"],
    invalidations: ["Consumo de la wall + acceptance through"],
    traps: ["Shortear call wall solo porque 'está dibujada'"],
    managementNotes: ["Si hay pulling, cancelar tesis de defensa"],
    relatedKnowledgeIds: [
      "gt_liq_wall_not_reversal",
      "gt_gamma_walls_reference",
      "gt_of_absorption_central",
      "gt_liq_persistence",
    ],
  }),
  setup({
    id: "gt_setup_failed_breakout",
    title: "Setup educativo: Failed breakout",
    concepts: ["failed breakout", "setup failed breakout", "falso breakout"],
    aliases: ["breakout fallido"],
    hypothesis:
      "Una ruptura sin acceptance puede fallar y rotar hacia el rango/origen.",
    statement: "Failed breakout como secuencia de subasta fallida, no como fade ciego del primer break.",
    explanation:
      "Enlaza unfinished/failed auction con reclaim y riesgo de continuación si la acceptance aparece tarde.",
    confirmations: ["Pérdida rápida del extremo", "Retorno con acceptance al rango", "Agresión de break se agota"],
    invalidations: ["Re-acceptance del breakout y expansión"],
    traps: ["Fadear el primer break en short gamma/thin book sin evidencia"],
    managementNotes: ["Tamaño menor cuando el régimen hipotético favorece expansión"],
    relatedKnowledgeIds: [
      "gt_of_failed_auction",
      "gt_liq_sweep_reclaim",
      "gt_gamma_pos_neg_hypothesis",
      "gt_risk_invalidation_first",
    ],
  }),
  setup({
    id: "gt_setup_defense_hold",
    title: "Setup educativo: Defensa de nivel + hold",
    concepts: ["setup defense", "level hold", "defensa de nivel"],
    aliases: ["hold educativo"],
    hypothesis:
      "Un nivel defendido con absorption y hold posterior puede ofrecer continuación en dirección de la defensa (hipótesis).",
    statement: "Hold educativo tras defensa verificada; distinto de 'comprar soporte genérico'.",
    explanation:
      "Enfatiza confirmaciones de hold (no solo el primer bounce) e invalidación bajo el extremo defendido.",
    confirmations: ["Absorption evidenciada", "Higher low / hold estructural", "Iniciativa a favor tras la defensa"],
    invalidations: ["Pérdida del extremo con acceptance"],
    traps: ["Entrar en el primer toque sin evidencia de defensa"],
    managementNotes: ["Invalidación bajo el swing de defensa; no martingale"],
    relatedKnowledgeIds: [
      "gt_of_absorption_central",
      "gt_of_acceptance_rejection",
      "gt_const_confirmation_is_evidence",
      "gt_risk_no_average_down_blind",
    ],
  }),
];
