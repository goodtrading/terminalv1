import { normalizeExtractorText } from "./transcriptParser";
import type { ExtractedCandidate } from "./knowledgeExtractor";

export type GoldenCaseHint = {
  isCandidate: boolean;
  reason: string;
  errorSnippet?: string;
  correctionSnippet?: string;
};

/**
 * Detect error → correction → example patterns as Golden Case candidates (not auto-approved).
 */
export function detectGoldenCaseCandidate(
  candidate: ExtractedCandidate,
  surroundingText?: string,
): GoldenCaseHint {
  const blob = normalizeExtractorText(
    `${candidate.statement} ${candidate.explanation} ${surroundingText ?? ""}`,
  );

  const errorMarks =
    /\b(error tipico|error comun|mal interpret|confundir|trampa|anti patron|no es |no significa)\b/;
  const correctionMarks =
    /\b(en realidad|lo correcto|la correccion|corregir|mejor pensar|en cambio|sino que)\b/;
  const exampleMarks = /\b(ejemplo|por ejemplo|caso)\b/;

  const hasError = errorMarks.test(blob) || candidate.kind === "ANTI_PATTERN";
  const hasCorrection = correctionMarks.test(blob);
  const hasExample = exampleMarks.test(blob) || candidate.kind === "EXAMPLE";

  if (hasError && (hasCorrection || hasExample)) {
    return {
      isCandidate: true,
      reason:
        "Patrón error→corrección/ejemplo detectado. Candidato a Golden Case — requiere aprobación humana.",
      errorSnippet: candidate.sourceExcerpt.slice(0, 300),
      correctionSnippet: hasCorrection
        ? candidate.statement.slice(0, 300)
        : undefined,
    };
  }

  return { isCandidate: false, reason: "Sin patrón error→corrección claro." };
}
