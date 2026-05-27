/**
 * In-memory market state store.
 *
 * Single source of truth for current market intelligence state and alerts.
 * Seeded with realistic defaults so the app works before the first terminal push.
 * Each terminal push replaces marketState entirely and merges alerts (dedup by id).
 *
 * V2: augment with EventEmitter / Redis pub-sub to fan out to WebSocket clients.
 */

export interface PriceZone {
  label: string;
  price: string;
  type: "resistance" | "support" | "current";
  distance: string;
}

export interface MarketLevels {
  globalFlip?: number | null;
  localFlip?: number | null;
  dealerPivot?: number | null;
  callWall?: number | null;
  putWall?: number | null;
}

export interface MarketState {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  gamma: "LONG" | "SHORT" | "NEUTRAL";
  zone: string;
  scenario: string;
  setup: string;
  probability: number;
  asset?: string;
  outlook?: string;
  timeframe?: string;
  tags?: string[];
  biasStrength?: number;
  gammaLevel?: number;
  netGamma?: string;
  flipPoint?: string;
  dominantExpiry?: string;
  lastUpdate: string;
  zones?: PriceZone[];
  levels?: MarketLevels;
}

export interface Alert {
  id: string;
  text: string;
  timestamp: string;
  issuedAt: string;
  status: "active" | "executed";
  type: "price" | "gamma" | "zone" | "absorption" | "scenario";
}

/** Provenance metadata tracked separately — not part of the public response */
export interface StoreTrace {
  /** Timestamp when the server process started (= seeded with defaults) */
  bootTime: string;
  /** Timestamp of the last accepted terminal push. null = no push yet this session */
  lastPushAt: string | null;
  /** How many pushes have been accepted this session */
  pushCount: number;
  /** Source of current marketState */
  stateSource: "seed_default" | "terminal_push";
}

interface Store {
  marketState: MarketState;
  alerts: Alert[];
  trace: StoreTrace;
}

function nowIso(): string {
  return new Date().toISOString();
}

const BOOT_TIME = nowIso();

const DEFAULT_STATE: MarketState = {
  bias: "BEARISH",
  gamma: "SHORT",
  zone: "$82K",
  scenario: "DISTRIBUCIÓN ACTIVA",
  setup: "RECHAZO → CONTINUACIÓN",
  probability: 78,
  outlook: "NEUTRAL → BEARISH",
  timeframe: "4H – 1D",
  tags: ["DISTRIBUCIÓN", "GAMMA SHORT", "RIESGO ALTO"],
  biasStrength: 78,
  gammaLevel: -72,
  netGamma: "-$1.2B",
  flipPoint: "83,500",
  dominantExpiry: "APR 11",
  lastUpdate: BOOT_TIME,
};

const DEFAULT_ALERTS: Alert[] = [
  {
    id: "a1",
    text: "BTC tocó resistencia menor en $82,450. Reacción bajista confirmada. Próximo objetivo: $80,500.",
    timestamp: "09 ABR · 14:30",
    issuedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    status: "active",
    type: "price",
  },
  {
    id: "a2",
    text: "Gamma flip completado. Transición LONG → SHORT gamma. Los dealers ahora amplifican movimientos a la baja.",
    timestamp: "09 ABR · 12:15",
    issuedAt: new Date(Date.now() - 135 * 60 * 1000).toISOString(),
    status: "active",
    type: "gamma",
  },
  {
    id: "a3",
    text: "Zona $80,500 en vigilancia máxima. Volumen institucional absorbiendo presión vendedora.",
    timestamp: "09 ABR · 10:02",
    issuedAt: new Date(Date.now() - 268 * 60 * 1000).toISOString(),
    status: "active",
    type: "zone",
  },
  {
    id: "a4",
    text: "EJECUTADA: Resistencia $84,200 rechazada con fuerza. Caída de -3.2% desde máximo. Setup funcionó.",
    timestamp: "08 ABR · 18:45",
    issuedAt: new Date(Date.now() - 1175 * 60 * 1000).toISOString(),
    status: "executed",
    type: "price",
  },
  {
    id: "a5",
    text: "Absorción masiva detectada en $80,000. Interés abierto acumulado: +18K contratos.",
    timestamp: "08 ABR · 15:20",
    issuedAt: new Date(Date.now() - 1380 * 60 * 1000).toISOString(),
    status: "executed",
    type: "absorption",
  },
  {
    id: "a6",
    text: "Escenario actualizado. Bias cambia a BEARISH. Reducir exposición larga inmediatamente.",
    timestamp: "08 ABR · 09:00",
    issuedAt: new Date(Date.now() - 1782 * 60 * 1000).toISOString(),
    status: "executed",
    type: "scenario",
  },
];

// Singleton in-memory store
const store: Store = {
  marketState: { ...DEFAULT_STATE },
  alerts: [...DEFAULT_ALERTS],
  trace: {
    bootTime: BOOT_TIME,
    lastPushAt: null,
    pushCount: 0,
    stateSource: "seed_default",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Read API
// ─────────────────────────────────────────────────────────────────────────────

export function getMarketState(): MarketState {
  return store.marketState;
}

export function getAlerts(
  status?: "active" | "executed",
  limit = 50,
): Alert[] {
  let result = store.alerts;
  if (status) {
    result = result.filter((a) => a.status === status);
  }
  result = [...result].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );
  return result.slice(0, limit);
}

export function getStoreTrace(): StoreTrace {
  return { ...store.trace };
}

// ─────────────────────────────────────────────────────────────────────────────
// Write API (terminal push)
// ─────────────────────────────────────────────────────────────────────────────

export function updateMarketState(state: MarketState): void {
  store.marketState = { ...state, lastUpdate: nowIso() };
  store.trace.lastPushAt = nowIso();
  store.trace.pushCount += 1;
  store.trace.stateSource = "terminal_push";
}

export function mergeAlerts(incoming: Alert[]): void {
  const existingIds = new Set(store.alerts.map((a) => a.id));
  for (const alert of incoming) {
    if (existingIds.has(alert.id)) {
      const idx = store.alerts.findIndex((a) => a.id === alert.id);
      if (idx !== -1) store.alerts[idx] = alert;
    } else {
      store.alerts.unshift(alert);
    }
  }
  if (store.alerts.length > 200) {
    store.alerts = store.alerts.slice(0, 200);
  }
}
