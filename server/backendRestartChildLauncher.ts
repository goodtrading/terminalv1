import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const pendingRegistryPath = process.env.GT_PENDING_REGISTRY_PATH;
let registry = { exists: false, size: null as number | null, mtimeMs: null as number | null };
try { const info = statSync(pendingRegistryPath!); registry = { exists: true, size: info.size, mtimeMs: info.mtimeMs }; } catch { /* expected before imports */ }
process.stdout.write(`${JSON.stringify({ phase: "child_pre_import_ready", pid: process.pid, ppid: process.ppid, cwd: process.cwd(), registryPath: pendingRegistryPath ?? null, registry, gtRepoRoot: process.env.GT_REPO_ROOT ?? null })}\n`);
let released = false;
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (released || !chunk.includes("RELEASE_FROM_PARENT")) return;
  released = true;
  process.env.GT_TEST_REGISTRY_PATH = pendingRegistryPath;
  void import(pathToFileURL(process.env.GT_BACKEND_HARNESS_PATH!).href);
});
