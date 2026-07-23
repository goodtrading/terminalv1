/**
 * File-backed Knowledge Evolution store (gitignored).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  KnowledgeEvolutionRunResult,
  RankedProposal,
  RegisteredRule,
  RuleHistory,
  TimelineEvent,
} from "@shared/goodTradingAiKnowledgeEvolution";

function defaultRootDir(): string {
  const env = process.env.GOODTRADING_AI_KNOWLEDGE_EVOLUTION_DIR?.trim();
  if (env) return env;
  return join(process.cwd(), "server", "storage", "knowledge-evolution");
}

export class KnowledgeEvolutionMemory {
  readonly rootDir: string;
  constructor(rootDir = defaultRootDir()) {
    this.rootDir = rootDir;
  }

  private reportsDir(): string {
    return join(this.rootDir, "private", "reports");
  }
  private registryFile(): string {
    return join(this.rootDir, "private", "registry.json");
  }
  private historyFile(): string {
    return join(this.rootDir, "private", "history.json");
  }
  private timelineFile(): string {
    return join(this.rootDir, "private", "timeline.json");
  }
  private proposalsDir(): string {
    return join(this.rootDir, "proposals");
  }

  ensureDirs(): void {
    for (const d of [this.rootDir, this.reportsDir(), this.proposalsDir(), join(this.rootDir, "private")]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  loadRegistry(): RegisteredRule[] {
    this.ensureDirs();
    if (!existsSync(this.registryFile())) return [];
    try {
      return JSON.parse(readFileSync(this.registryFile(), "utf8")) as RegisteredRule[];
    } catch {
      return [];
    }
  }

  saveRegistry(rules: RegisteredRule[]): void {
    this.ensureDirs();
    writeFileSync(this.registryFile(), JSON.stringify(rules, null, 2), "utf8");
  }

  loadHistories(): RuleHistory[] {
    this.ensureDirs();
    if (!existsSync(this.historyFile())) return [];
    try {
      return JSON.parse(readFileSync(this.historyFile(), "utf8")) as RuleHistory[];
    } catch {
      return [];
    }
  }

  saveHistories(histories: RuleHistory[]): void {
    this.ensureDirs();
    writeFileSync(this.historyFile(), JSON.stringify(histories, null, 2), "utf8");
  }

  loadTimeline(): TimelineEvent[] {
    this.ensureDirs();
    if (!existsSync(this.timelineFile())) return [];
    try {
      return JSON.parse(readFileSync(this.timelineFile(), "utf8")) as TimelineEvent[];
    } catch {
      return [];
    }
  }

  saveTimeline(events: TimelineEvent[]): void {
    this.ensureDirs();
    writeFileSync(this.timelineFile(), JSON.stringify(events, null, 2), "utf8");
  }

  saveRun(result: KnowledgeEvolutionRunResult, id = `run_${Date.now()}`): string {
    this.ensureDirs();
    writeFileSync(join(this.reportsDir(), `${id}.json`), JSON.stringify(result, null, 2), "utf8");
    this.saveRegistry(result.rules);
    this.saveHistories(result.histories);
    this.saveTimeline(result.timeline);
    for (const p of result.rankedProposals) this.saveProposal(p);
    return id;
  }

  latestRun(): KnowledgeEvolutionRunResult | null {
    this.ensureDirs();
    const files = readdirSync(this.reportsDir())
      .filter((f) => f.endsWith(".json"))
      .sort();
    if (!files.length) return null;
    try {
      return JSON.parse(readFileSync(join(this.reportsDir(), files[files.length - 1]!), "utf8")) as KnowledgeEvolutionRunResult;
    } catch {
      return null;
    }
  }

  saveProposal(p: RankedProposal): RankedProposal {
    this.ensureDirs();
    writeFileSync(join(this.proposalsDir(), `${p.id}.json`), JSON.stringify(p, null, 2), "utf8");
    return p;
  }

  listProposals(): RankedProposal[] {
    this.ensureDirs();
    return readdirSync(this.proposalsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.proposalsDir(), f), "utf8")) as RankedProposal);
  }

  resetForTests(): void {
    if (existsSync(this.rootDir)) rmSync(this.rootDir, { recursive: true, force: true });
    this.ensureDirs();
  }
}

let singleton: KnowledgeEvolutionMemory | null = null;
export function getKnowledgeEvolutionMemory(rootDir?: string): KnowledgeEvolutionMemory {
  if (!singleton || rootDir) singleton = new KnowledgeEvolutionMemory(rootDir);
  return singleton;
}

export function resetKnowledgeEvolutionMemoryForTests(rootDir?: string): void {
  singleton = new KnowledgeEvolutionMemory(rootDir);
  singleton.resetForTests();
}