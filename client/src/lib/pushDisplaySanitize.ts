/** Last line of defense in UI: never show junk tokens. */

function isJunkSetup(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/setup_test/i.test(t)) return true;
  if (t === "ANÁLISIS EN PROGRESO" || t === "ANALISIS EN PROGRESO") return true;
  if (t === "SIN DATOS DEL TERMINAL") return true;
  if (/^(no\s*)?definido\.?$/i.test(t)) return true;
  return false;
}

function isJunkZone(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^(no\s*)?definido\.?$/i.test(t)) return true;
  if (t === "SIN DATOS DEL TERMINAL") return true;
  return false;
}

export function sanitizeZoneForDisplay(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    return `$${v.toLocaleString("en-US")}`;
  }
  const s = String(v).trim();
  if (isJunkZone(s)) return "—";
  return s || "—";
}

export function sanitizeSetupForDisplay(v: string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const s = typeof v === "string" ? v.trim() : String(v).trim();
  if (isJunkSetup(s)) return "—";
  return s || "—";
}

export function sanitizeZonesLineFromRows(
  zones: Array<{ label?: string; price?: string }> | null | undefined
): string {
  if (!zones?.length) return "—";
  const parts = zones
    .map((z) => {
      const lbl = typeof z.label === "string" ? z.label.trim() : "";
      const pr = typeof z.price === "string" ? z.price.trim() : String(z.price ?? "").trim();
      const lblOk = lbl && !isJunkZone(lbl) && !isJunkSetup(lbl) ? lbl : "";
      const prOk = pr && !isJunkZone(pr) && !isJunkSetup(pr) ? pr : "";
      if (!lblOk && !prOk) return null;
      if (lblOk && prOk) return `${lblOk} ${prOk}`;
      return lblOk || prOk;
    })
    .filter((x): x is string => x != null && x.length > 0);
  return parts.length ? parts.join(" · ") : "—";
}
