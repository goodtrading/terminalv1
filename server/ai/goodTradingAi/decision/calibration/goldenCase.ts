/**
 * AI-7.1 — GoldenDecisionCase contract (methodology calibration, not win-rate).
 */
import { z } from "zod";
import {
  decisionPathOutcomeSchema,
  decisionQualityCategorySchema,
} from "@shared/goodTradingAiDecisionGraph";

export const goldenDecisionCategorySchema = z.enum([
  "IGNACIO_LENS",
  "ACCEPTANCE",
  "INVALIDATION_FIRST",
  "NO_OVERREACT_ISOLATED",
  "STALE_UNTRUSTED",
  "MULTI_LENS_CONFLICT",
  "WALL_REFERENCE",
  "GAMMA_REGIME",
  "ABSORPTION",
  "SWEEP_RECLAIM",
  "CONFIRMATION_STACK",
  "ADVERSARIAL",
  "COUNTERFACTUAL_BASE",
  "METAMORPHIC_BASE",
]);
export type GoldenDecisionCategory = z.infer<typeof goldenDecisionCategorySchema>;

export const goldenDecisionCaseSchema = z.object({
  id: z.string().min(3).max(80),
  category: goldenDecisionCategorySchema,
  question: z.string().min(1).max(2000),
  templateId: z.string().max(80).optional(),
  forceUntrusted: z.boolean().optional(),
  /** Expected primary outcomes (any-of). */
  expectOutcomes: z.array(decisionPathOutcomeSchema).min(1).max(8),
  expectQualities: z.array(decisionQualityCategorySchema).min(1).max(8).optional(),
  expectTemplateIncludes: z.string().max(40).optional(),
  /** Must NOT appear as primary outcome. */
  forbidOutcomes: z.array(decisionPathOutcomeSchema).max(8).optional(),
  notes: z.string().max(400).optional(),
  mentorEligible: z.literal(false),
});
export type GoldenDecisionCase = z.infer<typeof goldenDecisionCaseSchema>;
