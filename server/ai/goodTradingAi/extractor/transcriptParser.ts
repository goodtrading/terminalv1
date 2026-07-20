/**
 * Split class/stream transcripts into candidate segments (deterministic).
 */
export type TranscriptSegment = {
  index: number;
  text: string;
  normalized: string;
};

export function normalizeExtractorText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse free text into sentence/bullet segments suitable for rule extraction.
 */
export function parseTranscript(raw: string): TranscriptSegment[] {
  const cleaned = raw.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  // Keep "Regla: …" / "Heurística: …" intact — only split on colon for clocks/lists, not kind labels.
  const withProtectedLabels = cleaned.replace(
    /\b(regla|principio|heur[ií]stica|definici[oó]n|anti[- ]?patr[oó]n|ejemplo|setup|playbook|caso|invalidaci[oó]n|riesgo)\s*:\s+/gi,
    (_m, label: string) => `${label} — `,
  );

  const chunks = withProtectedLabels
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])|(?<=:)\s+|\s+[•\-–—]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  const out: TranscriptSegment[] = [];
  let i = 0;
  for (const text of chunks) {
    // Merge ultra-short follow-ups into previous when useful
    if (out.length && text.length < 28 && !/[.!?]/.test(text)) {
      const prev = out[out.length - 1]!;
      prev.text = `${prev.text} ${text}`.trim();
      prev.normalized = normalizeExtractorText(prev.text);
      continue;
    }
    out.push({
      index: i++,
      text: text.slice(0, 800),
      normalized: normalizeExtractorText(text),
    });
  }
  return out.slice(0, 200);
}
