import { chmodSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

const nodeRequire = createRequire(import.meta.url);

type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...values: Array<string | number | null>): Record<string, unknown> | undefined;
    all(...values: Array<string | number | null>): Array<Record<string, unknown>>;
    run(...values: Array<string | number | null>): { changes: number | bigint };
  };
  close(): void;
};

export type DurablePaperLifecycle = "STARTING" | "AVAILABLE" | "UNAVAILABLE" | "UNRECOVERED" | "TERMINATED";

export type DurablePaperSession = Readonly<{
  recordId: string;
  ownerUserId: number;
  simulationSessionId: string | null;
  lifecycle: DurablePaperLifecycle;
  accountId: string | null;
  reason: string | null;
  createdAt: number;
  updatedAt: number;
}>;

export type DurablePaperCommand = Readonly<{
  ownerUserId: number;
  simulationSessionId: string;
  idempotencyKey: string;
  requestHash: string;
  clientOrderId: string;
  status: "PENDING" | "ACKNOWLEDGED" | "AMBIGUOUS" | "REJECTED";
  response: Record<string, unknown> | null;
  reason: string | null;
}>;

export type AutonomousPaperIntent = Readonly<{
  ownerUserId: number;
  simulationSessionId: string;
  n13bSessionId: string;
  decisionId: string;
  executionIntentId: string;
  idempotencyKey: string;
  instrument: string;
  action: string;
  side: string;
  quantity: string;
  marketCapturedAt: string;
  evidenceHash: string;
  riskPolicyVersion: string;
  createdAt: number;
}>;

export type AutonomousPaperEvidenceStatus = "INTENT_CREATED" | "SUBMISSION_STARTED" | "SUBMITTED" | "AMBIGUOUS" | "RECONCILED" | "FILLED" | "REJECTED" | "CLOSED";
export type AutonomousPaperEvidence = Readonly<{
  recordId: string;
  ownerUserId: number;
  simulationSessionId: string;
  idempotencyKey: string;
  status: AutonomousPaperEvidenceStatus;
  capturedAt: number;
  evidence: Record<string, unknown>;
}>;
export type DurablePaperShutdownEvidence = Readonly<{
  recordId: string;
  ownerUserId: number;
  simulationSessionId: string;
  capturedAt: number;
  complete: boolean;
  evidence: Record<string, unknown>;
}>;

export type DurablePaperDiscardEvidence = Readonly<{
  recordId: string;
  ownerUserId: number;
  simulationSessionId: string;
  discardedAt: number;
  reason: string;
  finalOperationalState: "UNRECOVERED";
  position: "UNKNOWN";
  orders: "UNKNOWN";
  daemon: "ABSENT";
}>;

/** A failed pre-identity startup is preserved without inventing an engine identity. */
export type DurablePaperStartupAttemptEvidence = Readonly<{
  recordId: string;
  ownerUserId: number;
  simulationSessionId: null;
  lifecycle: "UNRECOVERED";
  position: "UNKNOWN";
  orders: "UNKNOWN";
  permissions: "NONE";
  commands: "NONE_SENT";
  reason: "daemon_start_cleanup_unconfirmed";
  cleanupConfirmed: false;
  capturedAt: number;
}>;

function toSession(row: Record<string, unknown>): DurablePaperSession {
  return {
    recordId: String(row.record_id),
    ownerUserId: Number(row.owner_user_id),
    simulationSessionId: row.simulation_session_id == null ? null : String(row.simulation_session_id),
    lifecycle: String(row.lifecycle) as DurablePaperLifecycle,
    accountId: row.account_id == null ? null : String(row.account_id),
    reason: row.reason == null ? null : String(row.reason),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

/** Local operational journal. It never restores/reuses Nautilus engine objects. */
export class ServerPaperSessionRegistry {
  private readonly database: SqliteDatabase;

  constructor(readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    // Node >=22.12 is the repository minimum. Keep this dynamic CommonJS lookup
    // so older @types/node packages do not pretend the experimental module is stable.
    const sqlite = nodeRequire("node:sqlite") as { DatabaseSync: new (filename: string) => SqliteDatabase };
    this.database = new sqlite.DatabaseSync(filePath);
    this.database.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS server_paper_sessions (
        record_id TEXT PRIMARY KEY,
        owner_user_id INTEGER NOT NULL,
        simulation_session_id TEXT UNIQUE,
        lifecycle TEXT NOT NULL CHECK (lifecycle IN ('STARTING','AVAILABLE','UNAVAILABLE','UNRECOVERED','TERMINATED')),
        account_id TEXT,
        reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS server_paper_sessions_owner_created
        ON server_paper_sessions(owner_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS server_paper_sessions_lifecycle
        ON server_paper_sessions(lifecycle);
      CREATE TABLE IF NOT EXISTS server_paper_commands (
        owner_user_id INTEGER NOT NULL,
        simulation_session_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        client_order_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING','ACKNOWLEDGED','AMBIGUOUS','REJECTED')),
        response_json TEXT,
        reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (owner_user_id, simulation_session_id, idempotency_key),
        UNIQUE (owner_user_id, simulation_session_id, client_order_id)
      );
      CREATE TABLE IF NOT EXISTS server_paper_shutdown_evidence (
        record_id TEXT PRIMARY KEY,
        owner_user_id INTEGER NOT NULL,
        simulation_session_id TEXT NOT NULL,
        captured_at INTEGER NOT NULL,
        complete INTEGER NOT NULL CHECK (complete IN (0,1)),
        evidence_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_paper_discard_evidence (
        record_id TEXT PRIMARY KEY,
        owner_user_id INTEGER NOT NULL,
        simulation_session_id TEXT NOT NULL,
        discarded_at INTEGER NOT NULL,
        reason TEXT NOT NULL,
        evidence_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_paper_startup_attempt_evidence (
        record_id TEXT PRIMARY KEY,
        owner_user_id INTEGER NOT NULL,
        simulation_session_id TEXT,
        lifecycle TEXT NOT NULL CHECK (lifecycle = 'UNRECOVERED'),
        position TEXT NOT NULL CHECK (position = 'UNKNOWN'),
        orders TEXT NOT NULL CHECK (orders = 'UNKNOWN'),
        permissions TEXT NOT NULL CHECK (permissions = 'NONE'),
        commands TEXT NOT NULL CHECK (commands = 'NONE_SENT'),
        reason TEXT NOT NULL CHECK (reason = 'daemon_start_cleanup_unconfirmed'),
        cleanup_confirmed INTEGER NOT NULL CHECK (cleanup_confirmed = 0),
        captured_at INTEGER NOT NULL,
        evidence_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS autonomous_paper_intents (
        owner_user_id INTEGER NOT NULL,
        simulation_session_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        n13b_session_id TEXT NOT NULL,
        decision_id TEXT NOT NULL,
        execution_intent_id TEXT NOT NULL,
        instrument TEXT NOT NULL,
        action TEXT NOT NULL,
        side TEXT NOT NULL,
        quantity TEXT NOT NULL,
        market_captured_at TEXT NOT NULL,
        evidence_hash TEXT NOT NULL,
        risk_policy_version TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (owner_user_id, simulation_session_id, idempotency_key),
        UNIQUE (owner_user_id, simulation_session_id, execution_intent_id)
      );
      CREATE TABLE IF NOT EXISTS autonomous_paper_evidence (
        record_id TEXT PRIMARY KEY,
        owner_user_id INTEGER NOT NULL,
        simulation_session_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('INTENT_CREATED','SUBMISSION_STARTED','SUBMITTED','AMBIGUOUS','RECONCILED','FILLED','REJECTED','CLOSED')),
        captured_at INTEGER NOT NULL,
        evidence_json TEXT NOT NULL,
        FOREIGN KEY (owner_user_id, simulation_session_id, idempotency_key)
          REFERENCES autonomous_paper_intents(owner_user_id, simulation_session_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS autonomous_paper_evidence_identity
        ON autonomous_paper_evidence(owner_user_id, simulation_session_id, idempotency_key, captured_at);
    `);
    try { chmodSync(filePath, 0o600); } catch { /* Windows ACL inherits from the user data directory. */ }
    this.trace("CONSTRUCTOR", { filePath: path.resolve(filePath) });
  }

  private trace(operation: string, fields: Record<string, unknown> = {}): void {
    if (process.env.GOODTRADING_REGISTRY_TRACE !== "1") return;
    console.error(JSON.stringify({ registryTrace: true, pid: process.pid, operation, registryPath: path.resolve(this.filePath), timestamp: Date.now(), ...fields }));
  }

  /** Called once when a new supervisor owns this registry. Never adopts a daemon. */
  markPriorSessionsUnrecovered(): void {
    this.trace("MARK_PRIOR_BEGIN");
    const now = Date.now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        UPDATE server_paper_commands
        SET status='AMBIGUOUS', reason='supervisor_restart_native_order_query_required', updated_at=?
        WHERE status='PENDING' AND simulation_session_id IN (
          SELECT simulation_session_id FROM server_paper_sessions
          WHERE lifecycle IN ('STARTING','AVAILABLE','UNAVAILABLE') AND simulation_session_id IS NOT NULL
        )
      `).run(now);
    this.database.prepare(`
      UPDATE server_paper_sessions
      SET lifecycle='UNRECOVERED', reason='supervisor_restart_state_unverified', updated_at=?
      WHERE lifecycle IN ('STARTING','AVAILABLE','UNAVAILABLE')
    `).run(now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  reserve(ownerUserId: number, recordId: string, maxSessions: number): DurablePaperSession {
    const now = Date.now();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const latest = this.latest(ownerUserId);
      this.trace("RESERVE_ATTEMPT", { ownerUserId, recordId, latest });
      if (latest && latest.lifecycle !== "TERMINATED" &&
          !(latest.lifecycle === "UNRECOVERED" && this.isUnrecoveredDiscarded(latest.recordId))) {
        const code = latest.lifecycle === "UNRECOVERED" ? "PAPER_RUNTIME_UNRECOVERED" : "PAPER_RUNTIME_ALREADY_EXISTS";
        throw new Error(code);
      }
      const count = this.database.prepare(`
        SELECT COUNT(*) AS count FROM server_paper_sessions
        WHERE lifecycle IN ('STARTING','AVAILABLE','UNAVAILABLE','UNRECOVERED')
          AND record_id NOT IN (
            SELECT record_id FROM server_paper_discard_evidence
            UNION SELECT record_id FROM server_paper_startup_attempt_evidence
          )
      `).get();
      if (Number(count?.count ?? 0) >= maxSessions) throw new Error("PAPER_RUNTIME_CAPACITY");
      this.database.prepare(`
        INSERT INTO server_paper_sessions
          (record_id, owner_user_id, simulation_session_id, lifecycle, account_id, reason, created_at, updated_at)
        VALUES (?, ?, NULL, 'STARTING', NULL, NULL, ?, ?)
      `).run(recordId, ownerUserId, now, now);
      const row = this.database.prepare("SELECT * FROM server_paper_sessions WHERE record_id=?").get(recordId);
      if (!row) throw new Error("PAPER_SESSION_RESERVATION_MISSING");
      this.database.exec("COMMIT");
      return toSession(row);
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  transition(
    recordId: string,
    lifecycle: DurablePaperLifecycle,
    fields: { simulationSessionId?: string | null; accountId?: string | null; reason?: string | null } = {},
  ): DurablePaperSession {
    const current = this.database.prepare("SELECT * FROM server_paper_sessions WHERE record_id=?").get(recordId);
    if (!current) throw new Error("PAPER_SESSION_RECORD_NOT_FOUND");
    const existingId = current.simulation_session_id == null ? null : String(current.simulation_session_id);
    const nextId = fields.simulationSessionId === undefined ? existingId : fields.simulationSessionId;
    if (existingId && nextId !== existingId) throw new Error("PAPER_SESSION_IDENTITY_IMMUTABLE");
    const now = Date.now();
    this.database.prepare(`
      UPDATE server_paper_sessions
      SET lifecycle=?, simulation_session_id=?, account_id=?, reason=?, updated_at=?
      WHERE record_id=?
    `).run(
      lifecycle,
      nextId,
      fields.accountId === undefined ? current.account_id as string | null : fields.accountId,
      fields.reason === undefined ? current.reason as string | null : fields.reason,
      now,
      recordId,
    );
    this.trace("TRANSITION", { ownerUserId: current.owner_user_id, recordId, simulationSessionId: nextId, oldLifecycle: current.lifecycle, newLifecycle: lifecycle });
    const updated = this.database.prepare("SELECT * FROM server_paper_sessions WHERE record_id=?").get(recordId);
    if (!updated) throw new Error("PAPER_SESSION_RECORD_NOT_FOUND");
    return toSession(updated);
  }

  latest(ownerUserId: number): DurablePaperSession | null {
    const row = this.database.prepare(`
      SELECT * FROM server_paper_sessions WHERE owner_user_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1
    `).get(ownerUserId);
    return row ? toSession(row) : null;
  }

  /** Explicit operator discard marker. The session lifecycle remains UNRECOVERED. */
  recordUnrecoveredDiscard(input: Omit<DurablePaperDiscardEvidence, "discardedAt"> & { discardedAt?: number }): DurablePaperDiscardEvidence {
    const session = this.database.prepare("SELECT owner_user_id, simulation_session_id, lifecycle, reason FROM server_paper_sessions WHERE record_id=?").get(input.recordId);
    if (!session || Number(session.owner_user_id) !== input.ownerUserId ||
        String(session.simulation_session_id) !== input.simulationSessionId ||
        String(session.lifecycle) !== "UNRECOVERED" || String(session.reason) !== input.reason) {
      throw new Error("PAPER_UNRECOVERED_DISCARD_SESSION_MISMATCH");
    }
    const existing = this.database.prepare("SELECT evidence_json FROM server_paper_discard_evidence WHERE record_id=?").get(input.recordId);
    if (existing) {
      let evidence: DurablePaperDiscardEvidence;
      try { evidence = JSON.parse(String(existing.evidence_json)) as DurablePaperDiscardEvidence; }
      catch { throw new Error("PAPER_UNRECOVERED_DISCARD_EVIDENCE_INVALID_JSON"); }
      if (evidence.ownerUserId !== input.ownerUserId || evidence.simulationSessionId !== input.simulationSessionId ||
          evidence.reason !== input.reason || evidence.finalOperationalState !== input.finalOperationalState ||
          evidence.position !== input.position || evidence.orders !== input.orders || evidence.daemon !== input.daemon) {
        throw new Error("PAPER_UNRECOVERED_DISCARD_EVIDENCE_CONFLICT");
      }
      return evidence;
    }
    const discardedAt = input.discardedAt ?? Date.now();
    const evidence: DurablePaperDiscardEvidence = { ...input, discardedAt };
    const evidenceJson = JSON.stringify(evidence);
    this.database.prepare(`
      INSERT INTO server_paper_discard_evidence
        (record_id, owner_user_id, simulation_session_id, discarded_at, reason, evidence_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id) DO NOTHING
    `).run(input.recordId, input.ownerUserId, input.simulationSessionId, discardedAt, input.reason, evidenceJson);
    const stored = this.database.prepare("SELECT evidence_json FROM server_paper_discard_evidence WHERE record_id=?").get(input.recordId);
    if (!stored) throw new Error("PAPER_UNRECOVERED_DISCARD_EVIDENCE_WRITE_FAILED");
    let written: DurablePaperDiscardEvidence;
    try { written = JSON.parse(String(stored.evidence_json)) as DurablePaperDiscardEvidence; }
    catch { throw new Error("PAPER_UNRECOVERED_DISCARD_EVIDENCE_INVALID_JSON"); }
    if (written.ownerUserId !== evidence.ownerUserId || written.simulationSessionId !== evidence.simulationSessionId ||
        written.reason !== evidence.reason || written.finalOperationalState !== evidence.finalOperationalState ||
        written.position !== evidence.position || written.orders !== evidence.orders || written.daemon !== evidence.daemon) {
      throw new Error("PAPER_UNRECOVERED_DISCARD_EVIDENCE_CONFLICT");
    }
    return written;
  }

  isUnrecoveredDiscarded(recordId: string): boolean {
    return Boolean(this.database.prepare(`
      SELECT record_id FROM server_paper_discard_evidence WHERE record_id=?
      UNION ALL
      SELECT record_id FROM server_paper_startup_attempt_evidence WHERE record_id=?
      LIMIT 1
    `).get(recordId, recordId));
  }

  recordUnrecoveredStartupAttempt(input: Omit<DurablePaperStartupAttemptEvidence, "capturedAt"> & { capturedAt?: number }): DurablePaperStartupAttemptEvidence {
    const session = this.database.prepare("SELECT owner_user_id, simulation_session_id, lifecycle, reason FROM server_paper_sessions WHERE record_id=?").get(input.recordId);
    if (!session || Number(session.owner_user_id) !== input.ownerUserId || session.simulation_session_id != null ||
        String(session.lifecycle) !== "UNRECOVERED" || String(session.reason) !== input.reason ||
        input.simulationSessionId !== null || input.lifecycle !== "UNRECOVERED" || input.position !== "UNKNOWN" ||
        input.orders !== "UNKNOWN" || input.permissions !== "NONE" || input.commands !== "NONE_SENT" ||
        input.reason !== "daemon_start_cleanup_unconfirmed" || input.cleanupConfirmed !== false) {
      throw new Error("PAPER_UNRECOVERED_STARTUP_EVIDENCE_MISMATCH");
    }
    const evidence: DurablePaperStartupAttemptEvidence = { ...input, capturedAt: input.capturedAt ?? Date.now() };
    const json = JSON.stringify(evidence);
    this.database.prepare(`
      INSERT INTO server_paper_startup_attempt_evidence
        (record_id, owner_user_id, simulation_session_id, lifecycle, position, orders, permissions, commands, reason, cleanup_confirmed, captured_at, evidence_json)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(record_id) DO NOTHING
    `).run(input.recordId, input.ownerUserId, input.lifecycle, input.position, input.orders, input.permissions, input.commands, input.reason, evidence.capturedAt, json);
    const stored = this.database.prepare("SELECT evidence_json FROM server_paper_startup_attempt_evidence WHERE record_id=?").get(input.recordId);
    if (!stored) throw new Error("PAPER_UNRECOVERED_STARTUP_EVIDENCE_WRITE_FAILED");
    let written: DurablePaperStartupAttemptEvidence;
    try { written = JSON.parse(String(stored.evidence_json)) as DurablePaperStartupAttemptEvidence; }
    catch { throw new Error("PAPER_UNRECOVERED_STARTUP_EVIDENCE_INVALID_JSON"); }
    if (written.recordId !== evidence.recordId || written.ownerUserId !== evidence.ownerUserId ||
        written.simulationSessionId !== null || written.lifecycle !== "UNRECOVERED" || written.position !== "UNKNOWN" ||
        written.orders !== "UNKNOWN" || written.permissions !== "NONE" || written.commands !== "NONE_SENT" ||
        written.reason !== "daemon_start_cleanup_unconfirmed" || written.cleanupConfirmed !== false) {
      throw new Error("PAPER_UNRECOVERED_STARTUP_EVIDENCE_CONFLICT");
    }
    return written;
  }

  recordShutdownEvidence(input: Omit<DurablePaperShutdownEvidence, "capturedAt"> & { capturedAt?: number }): DurablePaperShutdownEvidence {
    const session = this.database.prepare("SELECT owner_user_id, simulation_session_id FROM server_paper_sessions WHERE record_id=?").get(input.recordId);
    if (!session || Number(session.owner_user_id) !== input.ownerUserId || String(session.simulation_session_id) !== input.simulationSessionId) {
      throw new Error("PAPER_SHUTDOWN_EVIDENCE_SESSION_MISMATCH");
    }
    const capturedAt = input.capturedAt ?? Date.now();
    const evidenceJson = JSON.stringify(input.evidence);
    if (Buffer.byteLength(evidenceJson, "utf8") > 2_000_000) throw new Error("PAPER_SHUTDOWN_EVIDENCE_TOO_LARGE");
    this.database.prepare(`
      INSERT INTO server_paper_shutdown_evidence
        (record_id, owner_user_id, simulation_session_id, captured_at, complete, evidence_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(record_id) DO UPDATE SET
        captured_at=excluded.captured_at, complete=excluded.complete, evidence_json=excluded.evidence_json
    `).run(input.recordId, input.ownerUserId, input.simulationSessionId, capturedAt, input.complete ? 1 : 0, evidenceJson);
    return { ...input, capturedAt };
  }

  shutdownEvidence(recordId: string): DurablePaperShutdownEvidence | null {
    const row = this.database.prepare("SELECT * FROM server_paper_shutdown_evidence WHERE record_id=?").get(recordId);
    if (!row) return null;
    let evidence: Record<string, unknown>;
    try { evidence = JSON.parse(String(row.evidence_json)) as Record<string, unknown>; }
    catch { throw new Error("PAPER_SHUTDOWN_EVIDENCE_INVALID_JSON"); }
    return {
      recordId: String(row.record_id),
      ownerUserId: Number(row.owner_user_id),
      simulationSessionId: String(row.simulation_session_id),
      capturedAt: Number(row.captured_at),
      complete: Number(row.complete) === 1,
      evidence,
    };
  }

  reserveCommand(input: Omit<DurablePaperCommand, "status" | "response" | "reason">): { command: DurablePaperCommand; created: boolean } {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database.prepare(`
        SELECT * FROM server_paper_commands
        WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?
      `).get(input.ownerUserId, input.simulationSessionId, input.idempotencyKey);
      if (row) {
        if (String(row.request_hash) !== input.requestHash) throw new Error("PAPER_IDEMPOTENCY_CONFLICT");
        this.database.exec("COMMIT");
        return { command: this.toCommand(row), created: false };
      }
      const now = Date.now();
      this.database.prepare(`
        INSERT INTO server_paper_commands
          (owner_user_id, simulation_session_id, idempotency_key, request_hash, client_order_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).run(input.ownerUserId, input.simulationSessionId, input.idempotencyKey, input.requestHash, input.clientOrderId, now, now);
      const inserted = this.database.prepare(`
        SELECT * FROM server_paper_commands
        WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?
      `).get(input.ownerUserId, input.simulationSessionId, input.idempotencyKey);
      if (!inserted) throw new Error("PAPER_COMMAND_RESERVATION_MISSING");
      this.database.exec("COMMIT");
      return { command: this.toCommand(inserted), created: true };
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  transitionCommand(
    ownerUserId: number,
    simulationSessionId: string,
    idempotencyKey: string,
    status: DurablePaperCommand["status"],
    fields: { response?: Record<string, unknown> | null; reason?: string | null } = {},
  ): DurablePaperCommand {
    const current = this.database.prepare(`
      SELECT * FROM server_paper_commands
      WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?
    `).get(ownerUserId, simulationSessionId, idempotencyKey);
    if (!current) throw new Error("PAPER_COMMAND_NOT_FOUND");
    this.database.prepare(`
      UPDATE server_paper_commands SET status=?, response_json=?, reason=?, updated_at=?
      WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?
    `).run(
      status,
      fields.response === undefined ? current.response_json as string | null : fields.response == null ? null : JSON.stringify(fields.response),
      fields.reason === undefined ? current.reason as string | null : fields.reason,
      Date.now(), ownerUserId, simulationSessionId, idempotencyKey,
    );
    const updated = this.database.prepare(`
      SELECT * FROM server_paper_commands
      WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?
    `).get(ownerUserId, simulationSessionId, idempotencyKey);
    if (!updated) throw new Error("PAPER_COMMAND_NOT_FOUND");
    return this.toCommand(updated);
  }

  findCommand(ownerUserId: number, simulationSessionId: string, idempotencyKey: string): DurablePaperCommand | null {
    const row = this.database.prepare(`
      SELECT * FROM server_paper_commands
      WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?
    `).get(ownerUserId, simulationSessionId, idempotencyKey);
    return row ? this.toCommand(row) : null;
  }

  reserveAutonomousIntent(input: Omit<AutonomousPaperIntent, "createdAt">): { intent: AutonomousPaperIntent; created: boolean } {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.database.prepare(`SELECT * FROM autonomous_paper_intents WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?`).get(input.ownerUserId, input.simulationSessionId, input.idempotencyKey);
      if (existing) {
        const same = Number(existing.owner_user_id) === input.ownerUserId && String(existing.simulation_session_id) === input.simulationSessionId && String(existing.n13b_session_id) === input.n13bSessionId && String(existing.decision_id) === input.decisionId && String(existing.execution_intent_id) === input.executionIntentId && String(existing.instrument) === input.instrument && String(existing.action) === input.action && String(existing.side) === input.side && String(existing.quantity) === input.quantity && String(existing.market_captured_at) === input.marketCapturedAt && String(existing.evidence_hash) === input.evidenceHash && String(existing.risk_policy_version) === input.riskPolicyVersion;
        if (!same) throw new Error("AUTONOMOUS_INTENT_IDEMPOTENCY_CONFLICT");
        this.database.exec("COMMIT");
        return { intent: this.toAutonomousIntent(existing), created: false };
      }
      const createdAt = Date.now();
      this.database.prepare(`INSERT INTO autonomous_paper_intents (owner_user_id, simulation_session_id, idempotency_key, n13b_session_id, decision_id, execution_intent_id, instrument, action, side, quantity, market_captured_at, evidence_hash, risk_policy_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.ownerUserId, input.simulationSessionId, input.idempotencyKey, input.n13bSessionId, input.decisionId, input.executionIntentId, input.instrument, input.action, input.side, input.quantity, input.marketCapturedAt, input.evidenceHash, input.riskPolicyVersion, createdAt);
      const inserted = this.database.prepare(`SELECT * FROM autonomous_paper_intents WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?`).get(input.ownerUserId, input.simulationSessionId, input.idempotencyKey);
      if (!inserted) throw new Error("AUTONOMOUS_INTENT_RESERVATION_MISSING");
      this.database.exec("COMMIT");
      return { intent: this.toAutonomousIntent(inserted), created: true };
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  appendAutonomousEvidence(input: { ownerUserId: number; simulationSessionId: string; idempotencyKey: string; status: AutonomousPaperEvidenceStatus; evidence: Record<string, unknown>; capturedAt?: number }): AutonomousPaperEvidence {
    const intent = this.database.prepare(`SELECT 1 FROM autonomous_paper_intents WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=?`).get(input.ownerUserId, input.simulationSessionId, input.idempotencyKey);
    if (!intent) throw new Error("AUTONOMOUS_INTENT_NOT_FOUND");
    const evidence: AutonomousPaperEvidence = { recordId: randomUUID(), ownerUserId: input.ownerUserId, simulationSessionId: input.simulationSessionId, idempotencyKey: input.idempotencyKey, status: input.status, capturedAt: input.capturedAt ?? Date.now(), evidence: structuredClone(input.evidence) };
    this.database.prepare(`INSERT INTO autonomous_paper_evidence (record_id, owner_user_id, simulation_session_id, idempotency_key, status, captured_at, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(evidence.recordId, evidence.ownerUserId, evidence.simulationSessionId, evidence.idempotencyKey, evidence.status, evidence.capturedAt, JSON.stringify(evidence.evidence));
    return evidence;
  }

  listAutonomousEvidence(ownerUserId: number, simulationSessionId: string, idempotencyKey?: string): AutonomousPaperEvidence[] {
    const rows = idempotencyKey === undefined
      ? this.database.prepare(`SELECT * FROM autonomous_paper_evidence WHERE owner_user_id=? AND simulation_session_id=? ORDER BY captured_at ASC, rowid ASC`).all(ownerUserId, simulationSessionId)
      : this.database.prepare(`SELECT * FROM autonomous_paper_evidence WHERE owner_user_id=? AND simulation_session_id=? AND idempotency_key=? ORDER BY captured_at ASC, rowid ASC`).all(ownerUserId, simulationSessionId, idempotencyKey);
    return rows.map((row) => { let evidence: Record<string, unknown>; try { evidence = JSON.parse(String(row.evidence_json)) as Record<string, unknown>; } catch { throw new Error("AUTONOMOUS_EVIDENCE_INVALID_JSON"); } return { recordId: String(row.record_id), ownerUserId: Number(row.owner_user_id), simulationSessionId: String(row.simulation_session_id), idempotencyKey: String(row.idempotency_key), status: String(row.status) as AutonomousPaperEvidenceStatus, capturedAt: Number(row.captured_at), evidence }; });
  }
  close(): void {
    this.database.close();
  }

  private toAutonomousIntent(row: Record<string, unknown>): AutonomousPaperIntent {
    return { ownerUserId: Number(row.owner_user_id), simulationSessionId: String(row.simulation_session_id), n13bSessionId: String(row.n13b_session_id), decisionId: String(row.decision_id), executionIntentId: String(row.execution_intent_id), idempotencyKey: String(row.idempotency_key), instrument: String(row.instrument), action: String(row.action), side: String(row.side), quantity: String(row.quantity), marketCapturedAt: String(row.market_captured_at), evidenceHash: String(row.evidence_hash), riskPolicyVersion: String(row.risk_policy_version), createdAt: Number(row.created_at) };
  }

  private toCommand(row: Record<string, unknown>): DurablePaperCommand {
    let response: Record<string, unknown> | null = null;
    if (typeof row.response_json === "string") {
      try { response = JSON.parse(row.response_json) as Record<string, unknown>; } catch { response = null; }
    }
    return {
      ownerUserId: Number(row.owner_user_id),
      simulationSessionId: String(row.simulation_session_id),
      idempotencyKey: String(row.idempotency_key),
      requestHash: String(row.request_hash),
      clientOrderId: String(row.client_order_id),
      status: String(row.status) as DurablePaperCommand["status"],
      response,
      reason: row.reason == null ? null : String(row.reason),
    };
  }
}

export function defaultServerPaperRegistryPath(): string {
  const configured = process.env.GT_PAPER_RUNTIME_DATA_DIR;
  const root = configured
    ?? process.env.LOCALAPPDATA
    ?? process.env.XDG_STATE_HOME
    ?? path.join(os.homedir(), ".local", "state");
  return path.join(root, "GoodTrading Terminal", "Data", "server-paper-sessions.sqlite");
}
