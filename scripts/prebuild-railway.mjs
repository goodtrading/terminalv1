/**
 * Railway/Nixpacks pre-build: unlock stale Vite dep-cache under node_modules
 * before `npm ci` tries to rmdir it (EBUSY on cached layers).
 */
import path from "path";
import { safeRmPath } from "./safe-rm-path.mjs";

const targets = [
  path.join("node_modules", ".vite"),
  path.join("node_modules", ".vite-temp"),
];

let hadIssue = false;

for (const target of targets) {
  const result = await safeRmPath(target);
  if (result.action === "missing") continue;
  console.log(`[prebuild-railway] ${target}: ${result.action}${result.renamed ? ` → ${result.renamed}` : ""}`);
  if (!result.ok) {
    hadIssue = true;
    console.warn(`[prebuild-railway] could not clear ${target}: ${result.error ?? "unknown"}`);
  }
}

if (hadIssue) {
  console.warn("[prebuild-railway] continuing — npm ci may still succeed if cache was renamed");
}

process.exit(0);
