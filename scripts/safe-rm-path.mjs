/**
 * Best-effort recursive delete with EBUSY/ENOTEMPTY/EPERM retries.
 * Used before npm ci on Railway when node_modules/.vite is locked.
 */
import fs from "fs";
import path from "path";

const RETRYABLE = new Set(["EBUSY", "ENOTEMPTY", "EPERM", "EACCES"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function safeRmPath(targetPath, opts = {}) {
  const {
    retries = 5,
    delayMs = 200,
    renameOnFailure = true,
  } = opts;

  const abs = path.resolve(targetPath);
  if (!fs.existsSync(abs)) return { ok: true, action: "missing" };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      fs.rmSync(abs, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return { ok: true, action: "removed" };
    } catch (err) {
      const code = err && typeof err === "object" ? err.code : undefined;
      if (code && RETRYABLE.has(code) && attempt < retries) {
        await sleep(delayMs * attempt);
        continue;
      }

      if (renameOnFailure && code && RETRYABLE.has(code)) {
        const renamed = `${abs}.bak.${Date.now()}`;
        try {
          fs.renameSync(abs, renamed);
          return { ok: true, action: "renamed", renamed };
        } catch {
          // fall through
        }
      }

      return { ok: false, action: "failed", error: err instanceof Error ? err.message : String(err), code };
    }
  }

  return { ok: false, action: "failed", error: "exhausted retries" };
}
