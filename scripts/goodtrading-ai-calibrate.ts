#!/usr/bin/env node
/**
 * Interactive calibration interview CLI (no network, no knowledge mutation).
 * Saves progress into local calibration store drafts/reviews via store API functions.
 */
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { CALIBRATION_CASES } from "../server/ai/goodTradingAi/calibration/cases.ts";
import { buildCurrentAiResponseForCase } from "../server/ai/goodTradingAi/calibration/responseSnapshot.ts";
import { createOrUpdateReview } from "../server/ai/goodTradingAi/calibration/reviews.ts";
import { getReviewByCaseId, exportStoreJson } from "../server/ai/goodTradingAi/calibration/store.ts";
import { writeFileSync } from "node:fs";

const DECISIONS = [
  "APPROVED",
  "APPROVED_WITH_CHANGES",
  "REJECTED",
  "NEEDS_MORE_CONTEXT",
  "SKIPPED",
] as const;

async function main() {
  const rl = readline.createInterface({ input, output });
  console.log("GoodTrading AI Calibration CLI");
  console.log("No network. No knowledge mutation. Export reviews at the end.\n");

  let start = 0;
  const cont = await rl.question("Continue from case index (0-based, empty=0): ");
  if (cont.trim()) start = Math.max(0, parseInt(cont, 10) || 0);

  for (let i = start; i < CALIBRATION_CASES.length; i++) {
    const c = CALIBRATION_CASES[i]!;
    console.log("\n==================================================");
    console.log(`[${i + 1}/${CALIBRATION_CASES.length}] ${c.id} · ${c.domain}`);
    console.log(c.title);
    console.log("Q:", c.question);
    console.log("Context:", c.context);

    const existing = getReviewByCaseId(c.id);
    if (existing) console.log("Existing decision:", existing.decision);

    const ai = buildCurrentAiResponseForCase(c);
    console.log("\n--- Current AI ---");
    console.log(ai.summary.slice(0, 600));
    console.log(
      "Refs:",
      ai.knowledgeReferences.map((r) => r.id).join(", ") || "(none)",
    );

    const skip = await rl.question("\nSkip this case? (y/N): ");
    if (skip.trim().toLowerCase() === "y") continue;

    const answer = await rl.question("Qué haría Ignacio (answer): ");
    const corrections = await rl.question("Corrections: ");
    const missing = await rl.question("Missing context: ");
    console.log("Decision:", DECISIONS.join(" | "));
    const dRaw = await rl.question("Decision: ");
    const decision = (DECISIONS as readonly string[]).includes(dRaw.trim())
      ? (dRaw.trim() as (typeof DECISIONS)[number])
      : "NEEDS_MORE_CONTEXT";

    createOrUpdateReview({
      input: {
        caseId: c.id,
        decision,
        ignacioAnswer: answer,
        corrections,
        missingContext: missing,
        notes: "cli",
      },
      userId: 1,
      userEmail: "cli@local",
    });
    console.log("Saved review (no registry apply).");

    const stop = await rl.question("Stop now? (y/N): ");
    if (stop.trim().toLowerCase() === "y") break;
  }

  const out = `calibration-cli-export-${Date.now()}.json`;
  writeFileSync(out, exportStoreJson(), "utf8");
  console.log("Exported:", out);
  rl.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
