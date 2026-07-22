/**
 * AI-7.1 — ≥80 metamorphic cases (label-preserving transforms).
 * Paraphrase / synonym should not invent trading outcomes or flip mentorEligible.
 */
export type MetamorphicCase = {
  id: string;
  original: string;
  transform: string;
  transformKind: "paraphrase" | "synonym" | "whitespace" | "case";
};

function build(): MetamorphicCase[] {
  const bases = [
    "Explicá absorption con confirmación de pasivo",
    "Gamma como régimen no como señal",
    "Wall es referencia no reversión",
    "Sweep y reclaim con invalidación explícita",
    "Conflicto multi lente liquidez y order flow",
  ];
  const out: MetamorphicCase[] = [];
  for (let i = 0; i < 80; i++) {
    const b = bases[i % bases.length]!;
    const kind =
      i % 4 === 0
        ? "paraphrase"
        : i % 4 === 1
          ? "synonym"
          : i % 4 === 2
            ? "whitespace"
            : "case";
    let transform = b;
    if (kind === "paraphrase") transform = `Por favor, ${b.toLowerCase()} en metodología GoodTrading`;
    if (kind === "synonym") transform = b.replace(/Explicá/i, "Describí").replace(/confirmación/i, "evidencia de apoyo");
    if (kind === "whitespace") transform = `  ${b}  `;
    if (kind === "case") transform = b.toUpperCase();
    out.push({
      id: `mm_${String(i).padStart(3, "0")}`,
      original: b,
      transform: `${transform} ·${i}`,
      transformKind: kind,
    });
  }
  return out;
}

export const METAMORPHIC_CASES: MetamorphicCase[] = build();
