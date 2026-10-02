import { existsSync, statSync } from "node:fs";
import { spawn } from "node:child_process";

const registryPath = process.env.GT_PENDING_REGISTRY_PATH ?? "";
let registry = { exists: false, size: null, mtimeMs: null };
if (existsSync(registryPath)) { const info = statSync(registryPath); registry = { exists: true, size: info.size, mtimeMs: info.mtimeMs }; }
process.stdout.write(`${JSON.stringify({ phase: "child_pre_import_ready", pid: process.pid, ppid: process.ppid, cwd: process.cwd(), registryPath, registry, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null })}\n`);
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  if (chunk.includes("EXIT_AFTER_BACKEND")) {
    process.exit(0);
  }
  if (!chunk.includes("RELEASE_FROM_PARENT") || process.env.GT_BACKEND_STARTED === "1") return;
  process.env.GT_BACKEND_STARTED = "1";
  const env = { ...process.env, GT_TEST_REGISTRY_PATH: registryPath };
  const child = spawn(process.execPath, ["--import", process.env.GT_TSX_LOADER, process.env.GT_BACKEND_HARNESS_PATH], { env, cwd: process.cwd(), stdio: "inherit", windowsHide: true });
  child.once("exit", (code, signal) => { process.stdout.write(`${JSON.stringify({ phase: "backend_child_exit", code, signal })}\n`); });
});
