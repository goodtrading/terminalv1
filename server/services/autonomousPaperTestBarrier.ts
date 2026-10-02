import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type AutonomousPaperBarrierName =
  | "AFTER_INTENT_CREATED"
  | "AFTER_SUBMISSION_STARTED"
  | "AFTER_CANONICAL_SUBMIT_BEFORE_N13B_RESULT"
  | "AFTER_CANONICAL_FILL_BEFORE_RECONCILED";

const ROOT_ENV = "GT_N13B_BARRIER_ROOT";
const NAMES_ENV = "GT_N13B_BARRIER_NAMES";
const TIMEOUT_ENV = "GT_N13B_BARRIER_TIMEOUT_MS";

function enabled(name: AutonomousPaperBarrierName): string | null {
  const root = process.env[ROOT_ENV]?.trim();
  if (!root) return null;
  const names = new Set((process.env[NAMES_ENV] ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  return names.has(name) ? path.resolve(root) : null;
}

function marker(root: string, prefix: string, name: string): string {
  return path.join(root, `${prefix}-${name}${prefix === "reached" ? ".json" : ""}`);
}

export async function awaitAutonomousPaperBarrier(name: AutonomousPaperBarrierName): Promise<void> {
  const root = enabled(name);
  if (!root) return;
  await mkdir(root, { recursive: true });
  await writeFile(marker(root, "reached", name), JSON.stringify({ name, pid: process.pid, reachedAt: Date.now() }) + "\n", "utf8");
  const timeoutMs = Number(process.env[TIMEOUT_ENV] ?? "600000");
  const deadline = Date.now() + (Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 600000);
  const releasePath = marker(root, "release", name);
  while (Date.now() < deadline) {
    try {
      await access(releasePath);
      try { await readFile(releasePath, "utf8"); } catch { /* release marker appeared between access/read */ }
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`AUTONOMOUS_PAPER_BARRIER_TIMEOUT:${name}`);
}
