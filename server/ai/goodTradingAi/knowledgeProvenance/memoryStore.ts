/**
 * File-backed Knowledge Provenance store (gitignored). Append-oriented.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  JustificationEvent,
  ProvenanceRecord,
  ProvenanceRunResult,
} from "@shared/goodTradingAiKnowledgeProvenance";

function defaultRootDir(): string {
  const env = process.env.GOODTRADING_AI_KNOWLEDGE_PROVENANCE_DIR?.trim();
  if (env) return env;
  return join(process.cwd(), "server", "storage", "knowledge-provenance");
}

export class KnowledgeProvenanceMemory {
  readonly rootDir: string;
  constructor(rootDir = defaultRootDir()) {
    this.rootDir = rootDir;
  }

  private privateDir(): string {
    return join(this.rootDir, "private");
  }
  private reportsDir(): string {
    return join(this.privateDir(), "reports");
  }
  private registryFile(): string {
    return join(this.privateDir(), "registry.json");
  }
  private eventsFile(): string {
    return join(this.privateDir(), "events.json");
  }

  ensureDirs(): void {
    for (const d of [this.rootDir, this.privateDir(), this.reportsDir()]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  loadRegistry(): ProvenanceRecord[] {
    this.ensureDirs();
    if (!existsSync(this.registryFile())) return [];
    try {
      return JSON.parse(readFileSync(this.registryFile(), "utf8")) as ProvenanceRecord[];
    } catch {
      return [];
    }
  }

  saveRegistry(records: ProvenanceRecord[]): void {
    this.ensureDirs();
    writeFileSync(this.registryFile(), JSON.stringify(records, null, 2), "utf8");
  }

  loadEvents(): JustificationEvent[] {
    this.ensureDirs();
    if (!existsSync(this.eventsFile())) return [];
    try {
      return JSON.parse(readFileSync(this.eventsFile(), "utf8")) as JustificationEvent[];
    } catch {
      return [];
    }
  }

  /** Append-only merge by event id — never overwrite existing events. */
  saveEvents(events: JustificationEvent[]): void {
    this.ensureDirs();
    const prev = this.loadEvents();
    const map = new Map(prev.map((e) => [e.id, e]));
    for (const e of events) {
      if (!map.has(e.id)) map.set(e.id, e);
    }
    writeFileSync(
      this.eventsFile(),
      JSON.stringify([...map.values()].sort((a, b) => a.atMs - b.atMs), null, 2),
      "utf8",
    );
  }

  saveRun(result: ProvenanceRunResult, id = `run_${Date.now()}`): string {
    this.ensureDirs();
    writeFileSync(join(this.reportsDir(), `${id}.json`), JSON.stringify(result, null, 2), "utf8");
    this.saveRegistry(result.registry);
    this.saveEvents(result.events);
    return id;
  }

  latestRun(): ProvenanceRunResult | null {
    this.ensureDirs();
    const files = readdirSync(this.reportsDir())
      .filter((f) => f.endsWith(".json"))
      .sort();
    if (!files.length) return null;
    try {
      return JSON.parse(readFileSync(join(this.reportsDir(), files[files.length - 1]!), "utf8")) as ProvenanceRunResult;
    } catch {
      return null;
    }
  }

  resetForTests(): void {
    if (existsSync(this.rootDir)) rmSync(this.rootDir, { recursive: true, force: true });
    this.ensureDirs();
  }
}

let singleton: KnowledgeProvenanceMemory | null = null;
export function getKnowledgeProvenanceMemory(rootDir?: string): KnowledgeProvenanceMemory {
  if (!singleton || rootDir) singleton = new KnowledgeProvenanceMemory(rootDir);
  return singleton;
}

export function resetKnowledgeProvenanceMemoryForTests(rootDir?: string): void {
  singleton = new KnowledgeProvenanceMemory(rootDir);
  singleton.resetForTests();
}