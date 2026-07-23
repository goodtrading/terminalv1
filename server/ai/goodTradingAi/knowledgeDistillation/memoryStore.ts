/**
 * File-backed Knowledge Distillation store (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CompressedProposal, DistillationRunResult } from "@shared/goodTradingAiKnowledgeDistillation";

function defaultRootDir(): string {
  const env = process.env.GOODTRADING_AI_KNOWLEDGE_DISTILLATION_DIR?.trim();
  if (env) return env;
  return join(process.cwd(), "server", "storage", "knowledge-distillation");
}

export class KnowledgeDistillationMemory {
  readonly rootDir: string;
  constructor(rootDir = defaultRootDir()) {
    this.rootDir = rootDir;
  }

  private reportsDir(): string {
    return join(this.rootDir, "private", "reports");
  }
  private proposalsDir(): string {
    return join(this.rootDir, "proposals");
  }

  ensureDirs(): void {
    for (const d of [this.rootDir, this.reportsDir(), this.proposalsDir()]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  saveRun(result: DistillationRunResult, id = `run_${Date.now()}`): string {
    this.ensureDirs();
    const file = join(this.reportsDir(), `${id}.json`);
    writeFileSync(file, JSON.stringify(result, null, 2), "utf8");
    for (const p of result.compressedProposals) this.saveProposal(p);
    return id;
  }

  latestRun(): DistillationRunResult | null {
    this.ensureDirs();
    const files = readdirSync(this.reportsDir())
      .filter((f) => f.endsWith(".json"))
      .sort();
    if (!files.length) return null;
    try {
      return JSON.parse(readFileSync(join(this.reportsDir(), files[files.length - 1]!), "utf8")) as DistillationRunResult;
    } catch {
      return null;
    }
  }

  saveProposal(p: CompressedProposal): CompressedProposal {
    this.ensureDirs();
    writeFileSync(join(this.proposalsDir(), `${p.id}.json`), JSON.stringify(p, null, 2), "utf8");
    return p;
  }

  listProposals(): CompressedProposal[] {
    this.ensureDirs();
    return readdirSync(this.proposalsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.proposalsDir(), f), "utf8")) as CompressedProposal);
  }

  resetForTests(): void {
    if (existsSync(this.rootDir)) rmSync(this.rootDir, { recursive: true, force: true });
    this.ensureDirs();
  }
}

let singleton: KnowledgeDistillationMemory | null = null;
export function getKnowledgeDistillationMemory(rootDir?: string): KnowledgeDistillationMemory {
  if (!singleton || rootDir) singleton = new KnowledgeDistillationMemory(rootDir);
  return singleton;
}

export function resetKnowledgeDistillationMemoryForTests(rootDir?: string): void {
  singleton = new KnowledgeDistillationMemory(rootDir);
  singleton.resetForTests();
}