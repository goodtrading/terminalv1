#!/usr/bin/env node
/**
 * Offline proposal applicator (AI-2.1).
 * Usage:
 *   npm run goodtrading-ai:calibration:apply -- --proposal <id> --dry-run
 * Never commits/pushes. Dirty tree → dry-run + patch export only.
 */
import { applyProposalOffline } from "../server/ai/goodTradingAi/calibration/applyCli.ts";
import { upsertProposal, getProposal } from "../server/ai/goodTradingAi/calibration/store.ts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const proposalId = arg("--proposal");
  if (!proposalId) {
    console.error("Usage: --proposal <id> [--dry-run] [--approve-first] [--force]");
    process.exit(1);
  }

  if (has("--approve-first")) {
    const p = getProposal(proposalId);
    if (!p) {
      console.error("Proposal not found");
      process.exit(1);
    }
    upsertProposal({ ...p, status: "APPROVED" });
    console.log("Marked APPROVED (still will dry-run if dirty tree).");
  }

  const result = applyProposalOffline({
    proposalId,
    dryRun: has("--dry-run") || !has("--force"),
    forceApply: has("--force"),
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
