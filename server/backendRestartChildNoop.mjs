process.stdout.write(`${JSON.stringify({ phase: "noop_ready", pid: process.pid, ppid: process.ppid, registryPath: process.env.GT_PENDING_REGISTRY_PATH ?? null, execArgv: process.execArgv, nodeOptions: process.env.NODE_OPTIONS ?? null })}\n`);
process.stdin.setEncoding("utf8");
process.stdin.on("data", () => {});
