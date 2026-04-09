/**
 * In-memory market state store.
 *
 * Single source of truth for the current market intelligence state and
 * alert list. Seeded with realistic defaults so the app works immediately
 * without a terminal push. The terminal POST /terminal/push endpoint
 * replaces this state entirely on each update.
 *
 * V2 note: this module is designed to be augmented with an EventEmitter
 * (or Redis pub/sub) to fan out state changes to WebSocket connections
 * without further restructuring.
 */

export interface MarketState {
  bias: "BULLISH" | "BEARISH" | "NEUTRAL";
  gamma: "LONG" | "SHORT" | "NEUTRAL";
  zone: string;
  scenario: string;
  setup: string;
  probability: number;
  outlook: string;
  timeframe: string;
  tags: string[];
  biasStrength: number;
  gammaLevel: number;
  netGamma: string;
  flipPoint: string;
  dominantExpiry: string;
  lastUpdate: string;
}

export interface Alert {
  id: string;
  text: string;
  timestamp: string;
  issuedAt: string;
  status: "active" | "executed";
  type: "price" | "gamma" | "zone" | "absorption" | "scenario";
}

interface Store {
  marketState: MarketState;
  alerts: Alert[];
}

function nowIso(): string {
  return new Date().toISOString();
}

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
  lastUpdate: nowIso(),
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

// Singleton store — mutated in-place by terminal pushes
const store: Store = {
  marketState: { ...DEFAULT_STATE },
  alerts: [...DEFAULT_ALERTS],
};

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
  // Sort newest first
  result = [...result].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime(),
  );
  return result.slice(0, limit);
}

export function updateMarketState(state: MarketState): void {
  store.marketState = { ...state, lastUpdate: nowIso() };
}

export function mergeAlerts(incoming: Alert[]): void {
  const existingIds = new Set(store.alerts.map((a) => a.id));
  for (const alert of incoming) {
    if (existingIds.has(alert.id)) {
      // Update existing alert in place
      const idx = store.alerts.findIndex((a) => a.id === alert.id);
      if (idx !== -1) store.alerts[idx] = alert;
    } else {
      store.alerts.unshift(alert);
    }
  }
  // Cap at 200 to prevent unbounded growth
  if (store.alerts.length > 200) {
    store.alerts = store.alerts.slice(0, 200);
  }
}
