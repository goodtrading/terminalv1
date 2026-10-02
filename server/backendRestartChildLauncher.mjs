import { existsSync, statSync } from "node:fs";
import { pathToFileURL } from "node:url";

const registryPath = process.env.GT_PENDING_REGISTRY_PATH ?? "";
let registry = { exists: false, size: null, mtimeMs: null };
if (existsSync(registryPath)) {
  const info = statSync(registryPath);
  registry = { exists: true, size: info.size, mtimeMs: info.mtimeMs };
}
process.stdout.write(`${JSON.stringify({ phase: "child_pre_import_ready", pid: process.pid, ppid: process.ppid, cwd: process.cwd(), registryPath, registry, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null })}\n`);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (!chunk.includes("RELEASE_FROM_PARENT")) return;
  process.env.GT_TEST_REGISTRY_PATH = registryPath;
  void import(pathToFileURL(process.env.GT_BACKEND_HARNESS_PATH).href);
});
