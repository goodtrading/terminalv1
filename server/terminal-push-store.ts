/**
 * Receptor: último POST /api/terminal/push en memoria + saneamiento.
 * GET /api/mobile/state fusiona esto en `data` para la app mobile / Market Insight.
 */

export type TerminalPushZone = {
  label: string;
  price: string;
  type?: string;
  distance?: string;
};

export type TerminalPushBody = {
  marketState?: Record<string, unknown>;
  zones?: TerminalPushZone[];
  alerts?: unknown[];
 [key: string]: unknown;
};

let lastPushSanitized: TerminalPushBody | null = null;
let lastPushAt = 0;

function isJunkZone(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (/^(no\s*)?definido\.?$/i.test(s)) return true;
  if (s === "No definido") return true;
  return false;
}

function isJunkSetup(raw: string): boolean {
  const s = raw.trim();
  if (!s) return true;
  if (/setup_test/i.test(s)) return true;
  if (s === "ANÁLISIS EN PROGRESO" || s === "ANALISIS EN PROGRESO") return true;
  if (/^(no\s*)?definido\.?$/i.test(s)) return true;
  if (s === "SIN DATOS DEL TERMINAL") return true;
  return false;
}

function isJunkToken(raw: string): boolean {
  return isJunkZone(raw) || isJunkSetup(raw);
}

/** Sanea cuerpo del push antes de guardar */
export function sanitizePushPayload(body: TerminalPushBody | null | undefined): TerminalPushBody {
  const b = body && typeof body === "object" ? body : {};
  const msIn = b.marketState && typeof b.marketState === "object" ? { ...b.marketState } : {};
  const ms: Record<string, unknown> = { ...msIn };

  if ("zone" in ms) {
    const z = ms.zone;
    if (z === null || z === undefined) ms.zone = "—";
    else if (typeof z === "number" && Number.isFinite(z) && z > 0) {
      ms.zone = `$${z.toLocaleString("en-US")}`;
    } else {
      const str = String(z).trim();
      ms.zone = isJunkZone(str) ? "—" : str || "—";
    }
  }

  if ("setup" in ms) {
    const st = ms.setup;
    if (st === null || st === undefined) ms.setup = "—";
    else {
      const str = typeof st === "string" ? st.trim() : String(st).trim();
      ms.setup = isJunkSetup(str) ? "—" : str || "—";
    }
  }

  const zonesIn = Array.isArray(b.zones) ? b.zones : [];
  const zones: TerminalPushZone[] = zonesIn
    .filter((z): z is TerminalPushZone => z != null && typeof z === "object")
    .map((z) => {
      const label = typeof z.label === "string" ? z.label.trim() : "";
      const price = typeof z.price === "string" ? z.price.trim() : String(z.price ?? "").trim();
      const lblOk = label && !isJunkToken(label) ? label : "";
      const priceOk = price && !isJunkToken(price) ? price : "";
      return {
        ...z,
        label: lblOk || "—",
        price: priceOk || "—",
      };
    })
    .filter((z) => !(z.label === "—" && z.price === "—"));

  return {
    ...b,
    marketState: ms,
    zones,
  };
}

export function setLastTerminalPush(body: unknown): TerminalPushBody {
  const raw = (body && typeof body === "object" ? body : {}) as TerminalPushBody;
  lastPushSanitized = sanitizePushPayload(raw);
  lastPushAt = Date.now();
  return lastPushSanitized;
}

export function getLastTerminalPushSanitized(): TerminalPushBody | null {
  return lastPushSanitized;
}

export function getLastPushMeta(): { at: number } | null {
  if (!lastPushSanitized) return null;
  return { at: lastPushAt };
}

/** Fusiona push saneado en el objeto `data` del mobile state */
export function mergePushIntoMobileData(data: Record<string, unknown> | undefined | null): {
  data: Record<string, unknown>;
  merged: boolean;
} {
  const base = data && typeof data === "object" ? { ...data } : {};
  const push = lastPushSanitized;
  if (!push || !push.marketState) {
    return { data: base, merged: false };
  }

  const prevMs =
    base.marketState && typeof base.marketState === "object"
      ? (base.marketState as Record<string, unknown>)
      : {};
  const incoming = push.marketState as Record<string, unknown>;

  base.marketState = {
    ...prevMs,
    ...incoming,
  };

  if (Array.isArray(push.zones)) {
    base.zones = push.zones;
  }

  const meta =
    base.meta && typeof base.meta === "object" ? { ...(base.meta as object) } : {};
  base.meta = {
    ...meta,
    terminalPushMerged: true,
    terminalPushAt: lastPushAt,
  };

  return { data: base, merged: true };
}
