import { createHash } from "node:crypto";
import { knowledgeRegistry } from "../knowledge/registry";

/** Stable fingerprint of registry ids+versions — not the full corpus. */
export function getKnowledgeRegistryVersion(): string {
  const payload = knowledgeRegistry
    .getAll()
    .map((e) => `${e.id}@${e.version}`)
    .sort()
    .join("|");
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `kr-${knowledgeRegistry.count()}-${hash}`;
}
