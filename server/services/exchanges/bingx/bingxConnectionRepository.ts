/**
 * AI-8.1.3 — Durable BingX connection repository.
 *
 * Makes saved BingX connections durable in Postgres so an ephemeral container
 * filesystem is never the production authority for credentials. Reuses the
 * existing AES-256-GCM ciphertext produced by `bingxCredentialStore` — this
 * module only persists the already-encrypted `StoredBingXConnection` payload
 * (no plaintext, no encryption key, no raw BingX responses).
 *
 * Modes (GOODTRADING_BINGX_CONNECTION_REPOSITORY):
 *   - "file"     : JSON file store (dev/local/test only; ephemeral in prod).
 *   - "postgres" : durable table `gt_bingx_connections`.
 * Default: production → postgres, otherwise → file.
 *
 * The credential-store read/write API stays synchronous. In postgres mode we
 * serve reads from a synchronous in-memory cache hydrated from Postgres at boot
 * and kept coherent by write-through; mutations are persisted to Postgres.
 *
 * Follows the durable calibration / decision-context Postgres patterns.
 */
import { pool } from "../../../db";
import type { StoredBingXConnection } from "./bingxTypes";
import { normalizeStoredConnectionFields } from "./bingxConnectionCapability";

export type BingxConnectionRepositoryMode = "file" | "postgres";

export type BingxConnectionStorageHealthStatus =
  | "DURABLE_READY"
  | "DEGRADED"
  | "UNSAFE_FILE"
  | "UNAVAILABLE"
  | "FILE_MODE";

export const UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE =
  "UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE" as const;

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isBingxConnectionPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim()) && Boolean(pool);
}

/**
 * Repository mode. Explicit env always wins when valid; otherwise production
 * defaults to postgres (durable) and everything else to file.
 */
export function getBingxConnectionRepositoryMode(): BingxConnectionRepositoryMode {
  const raw = process.env.GOODTRADING_BINGX_CONNECTION_REPOSITORY
    ?.trim()
    .toLowerCase();
  if (raw === "file" || raw === "postgres") return raw;
  return isProductionRuntime() ? "postgres" : "file";
}

export function isBingxConnectionPostgresMode(): boolean {
  return getBingxConnectionRepositoryMode() === "postgres";
}

/**
 * Unsafe when production would rely on the ephemeral file store as the
 * authority for credentials. Saving must be blocked in this state.
 */
export function isUnsafeNonDurableBingxConnectionStore(): boolean {
  return isProductionRuntime() && getBingxConnectionRepositoryMode() === "file";
}

// ---------------------------------------------------------------------------
// Postgres schema
// ---------------------------------------------------------------------------

const DDL = `
CREATE TABLE IF NOT EXISTS gt_bingx_connections (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL,
  exchange text NOT NULL DEFAULT 'bingx',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gt_bingx_connections_user_idx
  ON gt_bingx_connections (user_id);
`;

let schemaReady: Promise<void> | null = null;

export async function ensureBingxConnectionSchema(): Promise<void> {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  if (!schemaReady) {
    schemaReady = pool.query(DDL).then(() => undefined);
  }
  await schemaReady;
}

export function resetBingxConnectionSchemaReadyForTests(): void {
  schemaReady = null;
}

// ---------------------------------------------------------------------------
// Postgres CRUD (async, parameterized)
// ---------------------------------------------------------------------------

function parseRow(payload: unknown): StoredBingXConnection | null {
  if (!payload || typeof payload !== "object") return null;
  const c = payload as StoredBingXConnection;
  if (typeof c.id !== "string" || typeof c.userId !== "number") return null;
  return normalizeStoredConnectionFields(c);
}

export async function pgReadAllConnections(): Promise<StoredBingXConnection[]> {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  await ensureBingxConnectionSchema();
  const res = await pool.query(
    `SELECT payload FROM gt_bingx_connections ORDER BY updated_at ASC`,
  );
  const out: StoredBingXConnection[] = [];
  for (const row of res.rows) {
    const parsed = parseRow((row as { payload: unknown }).payload);
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function pgUpsertConnection(
  row: StoredBingXConnection,
): Promise<void> {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  await ensureBingxConnectionSchema();
  await pool.query(
    `INSERT INTO gt_bingx_connections (id, user_id, exchange, payload, created_at, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, now(), now())
     ON CONFLICT (id) DO UPDATE
       SET payload = EXCLUDED.payload,
           user_id = EXCLUDED.user_id,
           exchange = EXCLUDED.exchange,
           updated_at = now()`,
    [row.id, row.userId, row.exchange ?? "bingx", JSON.stringify(row)],
  );
}

export async function pgDeleteConnection(id: string): Promise<void> {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  await ensureBingxConnectionSchema();
  await pool.query(`DELETE FROM gt_bingx_connections WHERE id = $1`, [id]);
}

/** Reconcile Postgres to exactly match the provided set of connections. */
export async function pgReconcileConnections(
  next: StoredBingXConnection[],
): Promise<void> {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  await ensureBingxConnectionSchema();
  const nextIds = next.map((c) => c.id);
  for (const row of next) {
    await pgUpsertConnection(row);
  }
  if (nextIds.length === 0) {
    await pool.query(`DELETE FROM gt_bingx_connections`);
  } else {
    await pool.query(
      `DELETE FROM gt_bingx_connections WHERE id <> ALL($1::uuid[])`,
      [nextIds],
    );
  }
}

// ---------------------------------------------------------------------------
// Synchronous cache + write-through (postgres mode only)
// ---------------------------------------------------------------------------

let cache: StoredBingXConnection[] = [];
let hydrated = false;
let hydrating: Promise<void> | null = null;
let lastPersist: Promise<void> = Promise.resolve();

/** Hydrate the in-memory cache from Postgres. Safe to call multiple times. */
export async function ensureBingxConnectionsHydrated(): Promise<void> {
  if (!isBingxConnectionPostgresMode()) return;
  if (!isBingxConnectionPostgresConfigured()) return;
  if (hydrated) return;
  if (!hydrating) {
    hydrating = (async () => {
      try {
        cache = await pgReadAllConnections();
        hydrated = true;
      } catch (err) {
        console.error(
          "[bingx-connection-repo] hydrate failed",
          err instanceof Error ? err.message : err,
        );
      } finally {
        hydrating = null;
      }
    })();
  }
  await hydrating;
}

/** Force-reload the cache from Postgres (e.g. after a migration). */
export async function reloadBingxConnectionCacheFromPostgres(): Promise<void> {
  if (!isBingxConnectionPostgresConfigured()) return;
  cache = await pgReadAllConnections();
  hydrated = true;
}

/** Synchronous read of cached connections (postgres mode). */
export function cacheReadAllConnections(): StoredBingXConnection[] {
  if (!hydrated && !hydrating) {
    // Kick off lazy hydration; first read may be empty until it completes.
    void ensureBingxConnectionsHydrated();
  }
  return cache.map((c) => ({ ...c }));
}

/** Replace cached connections and persist the new set to Postgres. */
export function cacheReplaceConnections(next: StoredBingXConnection[]): void {
  cache = next.map((c) => ({ ...c }));
  hydrated = true;
  const snapshot = cache.map((c) => ({ ...c }));
  lastPersist = lastPersist
    .catch(() => undefined)
    .then(() => pgReconcileConnections(snapshot))
    .catch((err) => {
      console.error(
        "[bingx-connection-repo] persist failed",
        err instanceof Error ? err.message : err,
      );
    });
}

/** Await any in-flight persistence (tests / graceful shutdown). */
export async function flushBingxConnectionPersistence(): Promise<void> {
  await lastPersist.catch(() => undefined);
}

export function resetBingxConnectionCacheForTests(): void {
  cache = [];
  hydrated = false;
  hydrating = null;
  lastPersist = Promise.resolve();
}

// ---------------------------------------------------------------------------
// Migration: file → postgres (controlled, idempotent)
// ---------------------------------------------------------------------------

export type BingxConnectionMigrationResult = {
  ran: boolean;
  sourceRecords: number;
  migrated: number;
  skipped: number;
  reason?: string;
};

/**
 * Migrate connections from the file store to Postgres. Expected sourceRecords=0
 * in production (no saved ephemeral connection). Idempotent: existing rows are
 * upserted by id, never duplicated.
 */
export async function migrateFileConnectionsToPostgres(
  fileConnections: StoredBingXConnection[],
): Promise<BingxConnectionMigrationResult> {
  if (!isBingxConnectionPostgresConfigured()) {
    return {
      ran: false,
      sourceRecords: fileConnections.length,
      migrated: 0,
      skipped: fileConnections.length,
      reason: "DATABASE_UNAVAILABLE",
    };
  }
  await ensureBingxConnectionSchema();
  let migrated = 0;
  let skipped = 0;
  for (const raw of fileConnections) {
    const row = parseRow(raw);
    if (!row) {
      skipped++;
      continue;
    }
    try {
      await pgUpsertConnection(row);
      migrated++;
    } catch (err) {
      skipped++;
      console.error(
        "[bingx-connection-repo] migrate row failed",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return {
    ran: true,
    sourceRecords: fileConnections.length,
    migrated,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Storage health (sanitized — no ids, no ciphertext, no secrets)
// ---------------------------------------------------------------------------

export type BingxConnectionStorageHealth = {
  status: BingxConnectionStorageHealthStatus;
  mode: BingxConnectionRepositoryMode;
  durable: boolean;
  postgresAvailable: boolean;
  unsafeNonDurable: boolean;
  connectionCount: number;
  code: string | null;
  evidence: string[];
};

export async function assessBingxConnectionStorageHealth(): Promise<BingxConnectionStorageHealth> {
  const mode = getBingxConnectionRepositoryMode();
  const unsafeNonDurable = isUnsafeNonDurableBingxConnectionStore();
  const evidence: string[] = [`mode=${mode}`];
  let postgresAvailable = false;
  let durable = false;
  let connectionCount = 0;
  let status: BingxConnectionStorageHealthStatus;

  if (unsafeNonDurable) {
    status = "UNSAFE_FILE";
    evidence.push(UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE);
  } else if (mode === "postgres") {
    if (!isBingxConnectionPostgresConfigured()) {
      status = "UNAVAILABLE";
      evidence.push("DATABASE_URL missing or pool null");
    } else {
      try {
        await pool!.query("SELECT 1 AS ok");
        await ensureBingxConnectionSchema();
        const rows = await pgReadAllConnections();
        connectionCount = rows.length;
        postgresAvailable = true;
        durable = true;
        status = "DURABLE_READY";
        evidence.push("postgres SELECT 1 ok", "schema ensured");
      } catch {
        status = "DEGRADED";
        evidence.push("postgres probe or schema failed");
      }
    }
  } else {
    status = "FILE_MODE";
    evidence.push("file repository (non-durable, dev/local only)");
  }

  return {
    status,
    mode,
    durable,
    postgresAvailable,
    unsafeNonDurable,
    connectionCount,
    code: unsafeNonDurable ? UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE : null,
    evidence: evidence.slice(0, 40),
  };
}
