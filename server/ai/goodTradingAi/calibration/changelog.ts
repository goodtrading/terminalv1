/**
 * Server-side changelog for knowledge editorial changes.
 * Not exposed to normal users.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CHANGELOG_DIR = join(__dirname, "..", "knowledge", "changelog");

export type ChangelogEntry = {
  id: string;
  entryId?: string;
  oldVersion?: string;
  newVersion?: string;
  caseId: string;
  reviewId: string;
  proposalId: string;
  date: string;
  reason: string;
  changeType: string;
  evalIds: string[];
  dryRun: boolean;
};

function changelogPath(): string {
  return join(CHANGELOG_DIR, "editorial-changelog.jsonl");
}

export function appendChangelog(entry: ChangelogEntry): void {
  if (!existsSync(CHANGELOG_DIR)) mkdirSync(CHANGELOG_DIR, { recursive: true });
  appendFileSync(changelogPath(), JSON.stringify(entry) + "\n", "utf8");
}

export function readChangelog(): ChangelogEntry[] {
  const p = changelogPath();
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ChangelogEntry);
}
