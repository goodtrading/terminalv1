import fs from "fs";
import path from "path";

const STORAGE_DIR = path.resolve(process.cwd(), "server", "storage");
const PAPER_LEGACY = path.join(STORAGE_DIR, "paper-trading-state.json");
const AUDIT_LOG = path.join(STORAGE_DIR, "audit-log.json");
const BINGX_CONNECTIONS = path.join(STORAGE_DIR, "bingx-connections.json");

function storageWritable(): boolean {
  try {
    ensureStorageDir();
    const probe = path.join(STORAGE_DIR, ".write-probe");
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function ensureStorageDir(): void {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/** Safe boot summary — no secret values. */
export function logBootEnvSummary(): void {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  let storageDirExists = false;
  try {
    storageDirExists = fs.existsSync(STORAGE_DIR);
  } catch {
    storageDirExists = false;
  }

  const summary = {
    nodeEnv,
    nodeVersion: process.version,
    cwd: process.cwd(),
    storageDirExists,
    storageWritable: storageWritable(),
    paperStateExists: fs.existsSync(PAPER_LEGACY),
    auditLogExists: fs.existsSync(AUDIT_LOG),
    bingxConnectionsExists: fs.existsSync(BINGX_CONNECTIONS),
    saasJwtSecretConfigured: Boolean(process.env.SAAS_JWT_SECRET?.trim()),
    bingxEncryptionKeyConfigured: Boolean(
      (process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "").length >= 16,
    ),
  };

  console.log("[boot] env summary", JSON.stringify(summary));
}

/** Visible in Railway logs to confirm deploy revision. */
export function logGoodTradingBuildStamp(): void {
  let version = "unknown";
  try {
    const raw = fs.readFileSync(
      path.resolve(process.cwd(), "package.json"),
      "utf8",
    );
    const pkg = JSON.parse(raw) as { version?: string };
    version = pkg.version ?? version;
  } catch {
    // ignore
  }

  const commit =
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) ??
    process.env.GIT_COMMIT?.slice(0, 12) ??
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
    "unknown";

  console.log(
    "[boot] GoodTrading build",
    JSON.stringify({
      version,
      commit,
      nodeEnv: process.env.NODE_ENV ?? "development",
      builtAt: process.env.BUILD_TIMESTAMP ?? new Date().toISOString(),
    }),
  );
}

export function warmupPaperStorage(): void {
  try {
    ensureStorageDir();
    if (!fs.existsSync(PAPER_LEGACY)) return;
    fs.readFileSync(PAPER_LEGACY, "utf8");
  } catch (err) {
    console.warn(
      "[boot] paper legacy state unreadable at warmup:",
      err instanceof Error ? err.message : err,
    );
  }
}
