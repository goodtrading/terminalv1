/**
 * Controlled offline applicator — NEVER auto-runs on review save.
 * With dirty working tree: force dry-run / export patch only (AI-2.1 safety).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getProposal, upsertProposal } from "./store";
import { appendChangelog } from "./changelog";
import { ensureKnowledgeRegistryValid } from "../knowledge/registry";
import { CALIBRATION_DATA_DIR } from "./store";

export type ApplyResult = {
  ok: boolean;
  dryRun: boolean;
  reason: string;
  proposalId: string;
  patchPath?: string;
  registryValid: boolean;
};

function isGitWorkingTreeDirty(cwd: string): boolean {
  try {
    const out = execSync("git status --porcelain", { cwd, encoding: "utf8" });
    return out.trim().length > 0;
  } catch {
    return true;
  }
}

export function applyProposalOffline(options: {
  proposalId: string;
  dryRun?: boolean;
  cwd?: string;
  forceApply?: boolean;
}): ApplyResult {
  const cwd = options.cwd ?? process.cwd();
  const proposal = getProposal(options.proposalId);
  if (!proposal) {
    return {
      ok: false,
      dryRun: true,
      reason: "PROPOSAL_NOT_FOUND",
      proposalId: options.proposalId,
      registryValid: false,
    };
  }

  if (proposal.status !== "APPROVED" && proposal.status !== "PENDING") {
    // Only APPROVED proposals may apply; PENDING requires explicit status bump first.
  }
  if (proposal.status !== "APPROVED") {
    return {
      ok: false,
      dryRun: true,
      reason: "PROPOSAL_NOT_APPROVED — mark proposal status APPROVED before apply",
      proposalId: proposal.id,
      registryValid: ensureKnowledgeRegistryValid().ok,
    };
  }

  const dirty = isGitWorkingTreeDirty(cwd);
  const forceDry = dirty || options.dryRun !== false || !options.forceApply;
  // Safety policy AI-2.1: if dirty tree, never mutate knowledge sources.
  const mustDryRun = dirty || options.forceApply !== true || options.dryRun !== false;

  const patchLines = [
    `# GoodTrading AI calibration patch (proposal ${proposal.id})`,
    `# changeType: ${proposal.changeType}`,
    `# target: ${proposal.targetEntryId ?? "(none)"}`,
    `# risk: ${proposal.risk}`,
    `# dryRun: true (auto-apply blocked when dirty tree or without --force)`,
    `# reason: ${proposal.reason}`,
    "",
    ...proposal.fieldChanges.map(
      (fc) =>
        `## ${fc.field}\n### before\n${fc.before ?? "(null)"}\n### after\n${fc.after}\n`,
    ),
  ];

  if (!existsSync(CALIBRATION_DATA_DIR)) mkdirSync(CALIBRATION_DATA_DIR, { recursive: true });
  const patchPath = join(CALIBRATION_DATA_DIR, `patch-${proposal.id}.md`);
  writeFileSync(patchPath, patchLines.join("\n"), "utf8");

  const reg = ensureKnowledgeRegistryValid();

  appendChangelog({
    id: `cl_${proposal.id}`,
    entryId: proposal.targetEntryId,
    caseId: proposal.caseId,
    reviewId: proposal.reviewId,
    proposalId: proposal.id,
    date: new Date().toISOString(),
    reason: proposal.reason,
    changeType: proposal.changeType,
    evalIds: proposal.associatedEvalIds,
    dryRun: true,
  });

  if (mustDryRun || forceDry) {
    upsertProposal({ ...proposal, status: "DRY_RUN_ONLY" });
    return {
      ok: true,
      dryRun: true,
      reason: dirty
        ? "DIRTY_WORKING_TREE — auto-apply NO-GO; patch exported for manual editorial apply"
        : "DRY_RUN — patch exported; knowledge sources not modified",
      proposalId: proposal.id,
      patchPath,
      registryValid: reg.ok,
    };
  }

  // Real apply path intentionally not implemented in AI-2.1 for safety.
  return {
    ok: false,
    dryRun: true,
    reason: "APPLY_NOT_IMPLEMENTED_SAFE_MODE",
    proposalId: proposal.id,
    patchPath,
    registryValid: reg.ok,
  };
}
