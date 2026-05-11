/**
 * Convención footprint / chart:
 * - Trades internos: siempre ms UNIX (normalizado al ingestar).
 * - FootprintBar.time: ms UNIX (apertura de bucket alineado al TF).
 * - Lightweight Charts `time` en series: normalmente UTCTimestamp = segundos UNIX;
 *   algunas fuentes envían ms; normalizamos a ms aquí.
 * - timeToCoordinate: pasar segundos (`ms / 1000`).
 */

const MS_THRESHOLD = 1e12;

/** Convierte tiempo de vela del chart a ms UNIX. */
export function chartTimeToUnixMs(t: unknown): number | null {
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  if (t < MS_THRESHOLD) return Math.floor(t * 1000);
  return Math.floor(t);
}

/** Segundos UNIX para APIs de coordenadas del chart. */
export function chartTimeToUnixSec(t: unknown): number | null {
  const ms = chartTimeToUnixMs(t);
  return ms == null ? null : Math.floor(ms / 1000);
}

/** Normaliza tiempo de trade (API / buffer) a ms UNIX. */
export function tradeTimeToUnixMs(t: number): number {
  if (!Number.isFinite(t)) return 0;
  if (t < MS_THRESHOLD) return Math.floor(t * 1000);
  return Math.floor(t);
}

/** Heurística para ventanas start/end ya numéricas (query / visible range). */
export function windowBoundsToUnixMs(from: number, to: number): { startMs: number; endMs: number } {
  const a = !Number.isFinite(from) ? Date.now() : from < MS_THRESHOLD ? Math.floor(from * 1000) : Math.floor(from);
  const b = !Number.isFinite(to) ? Date.now() : to < MS_THRESHOLD ? Math.floor(to * 1000) : Math.floor(to);
  return { startMs: Math.min(a, b), endMs: Math.max(a, b) };
}
