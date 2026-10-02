import { createHash, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface as ReadLineInterface } from "node:readline";
import { connect, type Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { recordShadowAuthorityBoundary } from "./shadowTraderAuthorityObserver";
import {
  defaultServerPaperRegistryPath,
  ServerPaperSessionRegistry,
  type AutonomousPaperEvidenceStatus,
  type AutonomousPaperEvidence,
  type AutonomousPaperIntent,
  type DurablePaperCommand,
} from "./serverPaperSessionRegistry";

export type ServerPaperLifecycle = "STARTING" | "AVAILABLE" | "UNAVAILABLE" | "UNRECOVERED" | "TERMINATED";

export type ServerPaperSnapshot = Readonly<{
  simulationSessionId: string;
  account: Record<string, unknown>;
  position: Record<string, unknown>;
}>;

export type ServerPaperQuoteObservation = Readonly<{
  source: string;
  symbol: string;
  marketType: string;
  bid: string;
  ask: string;
  bidSize: string;
  askSize: string;
  sourceTimestampMs: number;
  observedAtMs: number;
  sourceAgeMs: number;
  endpoint: string;
  sequence?: number;
}>;

export class ServerPaperRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number = 503,
  ) {
    super(message);
    this.name = "ServerPaperRuntimeError";
  }
}

type WireResponse = {
  id?: unknown;
  ok?: unknown;
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
};

type InFlight = {
  id: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type RuntimeRecord = {
  ownerUserId: number;
  durableRecordId: string;
  child: ChildProcess;
  socket: Socket;
  lines: ReadLineInterface;
  cwd: string;
  supervisorMetadataPath: string;
  supervisorMetadata: Record<string, unknown>;
  lifecycle: ServerPaperLifecycle;
  simulationSessionId: string | null;
  orderExecutionAuthorized: boolean;
  entryBlockedReason?: string;
  inFlight: InFlight | null;
  ignoredLateResponseIds: Set<string>;
  requestTail: Promise<void>;
  exitPromise: Promise<void>;
  resolveExit: () => void;
  stderrTail: string[];
  queuedRequests: number;
  quoteSequence: number;
  lastAppliedQuoteSequence: number | null;
  quoteUpdateRunning: boolean;
  pendingQuoteObservation: ServerPaperQuoteObservation | null | undefined;
  pendingQuoteUnavailableReason: string | null;
  nautilusVersion: string | null;
  runtimeModules: Record<string, { path: string; sha256: string }> | null;
};

export type NautilusServerPaperRuntimeOptions = Readonly<{
  runtimeRoot: string;
  maxSessions?: number;
  startTimeoutMs?: number;
  requestTimeoutMs?: number;
  registryPath?: string;
  maxQueuedRequests?: number;
  daemonScriptPath?: string;
  supervisorScriptPath?: string;
  allowControlledTestQuotes?: boolean;
  /** Enables server-internal, per-session grants in an explicitly opted-in development runtime. */
  allowOrderAuthorization?: boolean;
  /** Additional server-side kill switch; never sufficient without the session grant. */
  ordersEnabled?: boolean;
  prewarmPackage?: boolean;
  quoteProvider?: (ownerUserId: number, simulationSessionId: string) => Promise<ServerPaperQuoteObservation | null>;
  subscribeQuoteUpdates?: (listener: (observation: ServerPaperQuoteObservation | null, reason?: string) => void) => () => void;
  /** Isolated fault-injection seam; production construction never supplies it. */
  protectedEntryBeforeLeg?: (leg: "STOP_LOSS" | "TAKE_PROFIT") => void | Promise<void>;
}>;

const MAX_EXECUTION_QUOTE_AGE_MS = 3_000;
const REAL_PERP_SOURCES = new Set(["BINANCE_FAPI_WS_DEPTH", "BINANCE_FAPI_REST_BOOKTICKER"]);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function redactDaemonDiagnostic(line: string): string {
  return line
    .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/((?:token|secret|password|credential)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 500);
}

function finiteDecimal(value: unknown, field: string): number {
  if (typeof value !== "string" || !value.trim()) throw new ServerPaperRuntimeError("INVALID_PERP_QUOTE", `${field} is missing.` , 400);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ServerPaperRuntimeError("INVALID_PERP_QUOTE", `${field} must be finite.`, 400);
  return parsed;
}

function decimalTextHasPrecision(value: unknown, precision: number): value is string {
  return typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value)) && Number(value) > 0 && (value.split(".")[1]?.length ?? 0) <= precision;
}

function validUserId(userId: number): void {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new ServerPaperRuntimeError("PAPER_OWNER_INVALID", "A valid authenticated PAPER owner is required.", 401);
  }
}

function runtimeEnvironment(cwd: string, allowControlledTestQuotes: boolean, useSourceBridge: boolean): NodeJS.ProcessEnv {
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:\\Windows";
  return {
    SystemRoot: systemRoot,
    SYSTEMROOT: systemRoot,
    WINDIR: process.env.WINDIR ?? systemRoot,
    TEMP: cwd,
    TMP: cwd,
    PYTHONUNBUFFERED: "1",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    GOODTRADING_NAUTILUS_STARTUP_TRACE: "1",
    GOODTRADING_NAUTILUS_RPC_TRACE: process.env.GOODTRADING_NAUTILUS_RPC_TRACE === "1" ? "1" : "0",
    GOODTRADING_ALLOW_CONTROLLED_PAPER_QUOTES: allowControlledTestQuotes ? "1" : "0",
    GOODTRADING_USE_SOURCE_BRIDGE: useSourceBridge ? "1" : "0",
  };
}

function requireSessionId(value: unknown, operation: string): string {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>).simulationSessionId !== "string") {
    throw new ServerPaperRuntimeError(
      "NAUTILUS_SESSION_ID_MISSING",
      `Nautilus ${operation} response did not contain a simulationSessionId.`,
    );
  }
  const id = (value as Record<string, unknown>).simulationSessionId as string;
  if (!id.trim() || id.length > 128) {
    throw new ServerPaperRuntimeError("NAUTILUS_SESSION_ID_INVALID", `Nautilus ${operation} returned an invalid session identity.`);
  }
  return id;
}

/**
 * Owns one ephemeral Nautilus simulation per authenticated SaaS user. Order
 * submission is fail-closed and requires a server-only grant bound to this
 * runtime record's owner and exact simulationSessionId. Lost processes are
 * never restored from snapshots.
 */
export class NautilusServerPaperRuntimeManager {
  private readonly sessions = new Map<number, RuntimeRecord>();
  private readonly pendingStarts = new Map<number, Promise<{ simulationSessionId: string; alreadyRunning: boolean }>>();
  private readonly maxSessions: number;
  private readonly startTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxQueuedRequests: number;
  private readonly ordersEnabled: boolean;
  private packagePrewarm: Promise<void> | null = null;
  private packagePrewarmError: string | null = null;
  private packagePrewarmChild: ChildProcess | null = null;
  private registry: ServerPaperSessionRegistry | null = null;
  private readonly unsubscribeQuoteUpdates: (() => void) | null;
  private readonly inFlightCommands = new Map<string, { requestHash: string; promise: Promise<{ command: DurablePaperCommand; created: boolean }> }>();
  private readonly inFlightProtectedEntries = new Map<string, { requestHash: string; promise: Promise<{ command: DurablePaperCommand; created: boolean }> }>();
  private readonly protectedEntrySessionTails = new Map<string, Promise<{ command: DurablePaperCommand; created: boolean }>>();
  // Importing the packaged Nautilus extension concurrently can contend for
  // Windows DLL initialization and produce a native crash before the daemon
  // can answer health. Serialize only daemon startups; requests remain
  // independent once sessions are AVAILABLE.
  private startupTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: NautilusServerPaperRuntimeOptions) {
    this.maxSessions = options.maxSessions ?? 4;
    this.startTimeoutMs = options.startTimeoutMs ?? 60_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 5_000;
    this.maxQueuedRequests = options.maxQueuedRequests ?? 32;
    this.ordersEnabled = options.ordersEnabled === true;
    if (!Number.isSafeInteger(this.maxSessions) || this.maxSessions < 1) {
      throw new Error("maxSessions must be a positive integer");
    }
    if (!Number.isSafeInteger(this.maxQueuedRequests) || this.maxQueuedRequests < 1) {
      throw new Error("maxQueuedRequests must be a positive integer");
    }
    this.unsubscribeQuoteUpdates = options.subscribeQuoteUpdates?.((observation, reason) => {
      this.onQuoteUpdate(observation, reason);
    }) ?? null;
    if (options.prewarmPackage === true) {
      this.packagePrewarm = this.runPackagePreflight().catch((error) => {
        const message = error instanceof Error ? error.message : "runtime package preflight failed";
        this.packagePrewarmError = message.slice(0, 1200);
        console.error("[server-paper] runtime package preflight failed", { message: this.packagePrewarmError });
      });
    }
  }

  private async attachPersistedSession(userId: number, persisted: { recordId: string; simulationSessionId: string | null; lifecycle: ServerPaperLifecycle }): Promise<{ simulationSessionId: string; alreadyRunning: boolean }> {
    if (!persisted.simulationSessionId || persisted.lifecycle === "TERMINATED") throw new Error("persisted session identity unavailable");
    const metadataPath = this.supervisorMetadataPath(userId);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as Record<string, unknown>;
    if (metadata.ownerUserId !== userId || metadata.simulationSessionId !== persisted.simulationSessionId ||
        typeof metadata.supervisorEpoch !== "string" || typeof metadata.daemonInstanceId !== "string" ||
        metadata.protocolVersion !== 1 || typeof metadata.daemonPid !== "number" || metadata.daemonPid <= 0) {
      throw new Error("supervisor identity metadata mismatch");
    }
    const socket = await this.connectSupervisor(metadata);
    const child = {
      pid: Number(metadata.supervisorPid),
      exitCode: null,
      signalCode: null,
      killed: false,
      kill: () => { socket.destroy(); return true; },
    } as unknown as ChildProcess;
    const lines = createInterface({ input: socket });
    let resolveExit!: () => void;
    const exitPromise = new Promise<void>((resolve) => { resolveExit = resolve; });
    const record: RuntimeRecord = {
      ownerUserId: userId,
      durableRecordId: persisted.recordId,
      child,
      socket,
      lines,
      cwd: "",
      supervisorMetadataPath: metadataPath,
      supervisorMetadata: metadata,
      lifecycle: "STARTING",
      simulationSessionId: persisted.simulationSessionId,
      orderExecutionAuthorized: false,
      inFlight: null,
      ignoredLateResponseIds: new Set(),
      requestTail: Promise.resolve(),
      exitPromise,
      resolveExit,
      stderrTail: [],
      queuedRequests: 0,
      quoteSequence: 0,
      lastAppliedQuoteSequence: null,
      quoteUpdateRunning: false,
      pendingQuoteObservation: undefined,
      pendingQuoteUnavailableReason: null,
      nautilusVersion: typeof metadata.nautilusVersion === "string" ? metadata.nautilusVersion : null,
      runtimeModules: null,
    };
    this.sessions.set(userId, record);
    lines.on("line", (line) => this.receiveLine(record, line));
    lines.on("error", (error) => record.inFlight?.reject(error));
    socket.once("error", (error) => { record.inFlight?.reject(error); });
    socket.once("close", () => {
      if (record.lifecycle === "STARTING" || record.lifecycle === "AVAILABLE") {
        record.orderExecutionAuthorized = false;
        record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
        this.getRegistry().transition(record.durableRecordId, record.lifecycle, { reason: "supervisor_control_disconnect" });
      }
      record.inFlight?.reject(new Error("PAPER supervisor control connection closed."));
      resolveExit();
    });
    const attached = await this.request(record, "supervisor.attach", this.requestTimeoutMs);
    if (!attached || typeof attached !== "object" || (attached as Record<string, unknown>).simulationSessionId !== persisted.simulationSessionId) {
      socket.destroy();
      throw new ServerPaperRuntimeError("PAPER_SUPERVISOR_IDENTITY_MISMATCH", "The PAPER supervisor identity does not match the persisted session.", 409);
    }
    const health = await this.request(record, "health", this.startTimeoutMs);
    if (!health || typeof health !== "object" || (health as Record<string, unknown>).status !== "healthy") throw new Error("attached supervisor health failed");
    record.runtimeModules = await this.verifyLoadedRuntimeModules((health as Record<string, unknown>).runtimeModules, path.resolve(this.options.runtimeRoot));
    const status = await this.request(record, "simulation.status", this.requestTimeoutMs);
    if (!status || typeof status !== "object" || (status as Record<string, unknown>).simulationSessionId !== persisted.simulationSessionId) {
      socket.destroy();
      throw new ServerPaperRuntimeError("NAUTILUS_SESSION_ID_MISMATCH", "The attached Nautilus runtime belongs to a different simulation session.");
    }
    record.lifecycle = "AVAILABLE";
    return { simulationSessionId: persisted.simulationSessionId, alreadyRunning: true };
  }

  async startForUser(userId: number): Promise<{ simulationSessionId: string; alreadyRunning: boolean }> {
    validUserId(userId);
    if (this.packagePrewarm) {
      await this.packagePrewarm;
      if (this.packagePrewarmError) {
        throw new ServerPaperRuntimeError("NAUTILUS_RUNTIME_PACKAGE_PREWARM_FAILED", "The packaged Nautilus runtime did not complete its import preflight.");
      }
    }
    const registry = this.getRegistry();
    const pending = this.pendingStarts.get(userId);
    if (pending) return pending;
    const existing = this.sessions.get(userId);
    if (existing?.lifecycle === "AVAILABLE" && existing.simulationSessionId) {
      return { simulationSessionId: existing.simulationSessionId, alreadyRunning: true };
    }
    if (existing?.lifecycle === "UNRECOVERED") {
      const explicitlyDiscarded = registry.isUnrecoveredDiscarded(existing.durableRecordId);
      if (!explicitlyDiscarded || existing.child.exitCode == null) {
        throw new ServerPaperRuntimeError(
          "PAPER_RUNTIME_UNRECOVERED",
          "The previous server PAPER process was lost; its position and orders are unknown. Start a separate session only after an explicit recovery decision and confirmed process absence.",
          409,
        );
      }
      this.sessions.delete(userId);
    }
    const currentRecord = this.sessions.get(userId);
    if (currentRecord && currentRecord.lifecycle !== "TERMINATED") {
      throw new ServerPaperRuntimeError("PAPER_RUNTIME_UNAVAILABLE", `PAPER runtime is ${currentRecord.lifecycle}.`);
    }
    const persisted = registry.latest(userId);
    if (!existing && persisted && persisted.lifecycle !== "TERMINATED" &&
        !(persisted.lifecycle === "UNRECOVERED" && registry.isUnrecoveredDiscarded(persisted.recordId))) {
      try {
        return await this.attachPersistedSession(userId, persisted);
      } catch (error) {
        registry.transition(persisted.recordId, "UNRECOVERED", { reason: "supervisor_identity_missing_or_mismatched" });
        throw new ServerPaperRuntimeError("PAPER_RUNTIME_UNRECOVERED", "The persisted PAPER supervisor could not be attached with matching identity metadata; position and orders remain unknown.", 409);
      }
    }
    if (persisted && persisted.lifecycle !== "TERMINATED") {
      const explicitlyDiscarded = persisted.lifecycle === "UNRECOVERED" && registry.isUnrecoveredDiscarded(persisted.recordId);
      if (persisted.lifecycle === "UNRECOVERED" && !explicitlyDiscarded) {
        throw new ServerPaperRuntimeError(
          "PAPER_RUNTIME_UNRECOVERED",
          "The previous server PAPER process was lost; its position and orders are unknown. A new session requires an explicit discard or recovery decision.",
          409,
        );
      }
      if (!explicitlyDiscarded) {
        throw new ServerPaperRuntimeError("PAPER_RUNTIME_ALREADY_EXISTS", "A server PAPER session is already reserved for this owner.", 409);
      }
    }

    if (this.activeSessionCount() >= this.maxSessions) {
      throw new ServerPaperRuntimeError("PAPER_RUNTIME_CAPACITY", "Server PAPER runtime capacity is full.", 429);
    }

    const start = this.startupTail.then(() => this.createSession(userId));
    this.startupTail = start.then(() => undefined, () => undefined);
    this.pendingStarts.set(userId, start);
    try {
      return await start;
    } finally {
      if (this.pendingStarts.get(userId) === start) this.pendingStarts.delete(userId);
    }
  }

  async lookupForUser(userId: number): Promise<Record<string, unknown> | null> {
    validUserId(userId);
    try {
      return JSON.parse(await readFile(this.supervisorMetadataPath(userId), "utf8")) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  async attachForUser(userId: number): Promise<{ simulationSessionId: string; alreadyRunning: boolean }> {
    validUserId(userId);
    const persisted = this.getRegistry().latest(userId);
    if (!persisted || persisted.lifecycle === "TERMINATED") {
      throw new ServerPaperRuntimeError("PAPER_RUNTIME_UNAVAILABLE", "No persisted PAPER session is available for attachment.");
    }
    try {
      return await this.attachPersistedSession(userId, persisted);
    } catch {
      this.getRegistry().transition(persisted.recordId, "UNRECOVERED", { reason: "supervisor_identity_missing_or_mismatched" });
      throw new ServerPaperRuntimeError("PAPER_RUNTIME_UNRECOVERED", "The persisted PAPER supervisor could not be attached with matching identity metadata.", 409);
    }
  }

  getLifecycle(userId: number): { lifecycle: ServerPaperLifecycle; simulationSessionId: string | null; accountId: string | null; reason: string | null } {
    validUserId(userId);
    const persisted = this.getRegistry().latest(userId);
    const record = this.sessions.get(userId);
    if (record) {
      return {
        lifecycle: record.lifecycle,
        simulationSessionId: record.simulationSessionId,
        accountId: persisted?.accountId ?? null,
        reason: persisted?.reason ?? null,
      };
    }
    return persisted
      ? { lifecycle: persisted.lifecycle, simulationSessionId: persisted.simulationSessionId, accountId: persisted.accountId, reason: persisted.reason }
      : { lifecycle: "UNAVAILABLE", simulationSessionId: null, accountId: null, reason: "no_server_paper_session" };
  }

  getOrderExecutionAuthorization(userId: number): { authorized: boolean; simulationSessionId: string | null } {
    validUserId(userId);
    const record = this.sessions.get(userId);
    return {
      authorized: Boolean(record?.lifecycle === "AVAILABLE" && record.simulationSessionId && record.orderExecutionAuthorized),
      simulationSessionId: record?.simulationSessionId ?? null,
    };
  }

  reserveAutonomousIntent(input: Omit<AutonomousPaperIntent, "createdAt">): { intent: AutonomousPaperIntent; created: boolean } {
    return this.getRegistry().reserveAutonomousIntent(input);
  }

  appendAutonomousEvidence(input: { ownerUserId: number; simulationSessionId: string; idempotencyKey: string; status: AutonomousPaperEvidenceStatus; evidence: Record<string, unknown>; capturedAt?: number }): AutonomousPaperEvidence {
    return this.getRegistry().appendAutonomousEvidence(input);
  }

  listAutonomousEvidence(ownerUserId: number, simulationSessionId: string, idempotencyKey?: string): AutonomousPaperEvidence[] {
    return this.getRegistry().listAutonomousEvidence(ownerUserId, simulationSessionId, idempotencyKey);
  }


  grantOrderExecution(userId: number, simulationSessionId: string): { authorized: true; simulationSessionId: string } {
    validUserId(userId);
    if (this.options.allowOrderAuthorization !== true || !this.ordersEnabled) {
      throw new ServerPaperRuntimeError("PAPER_ORDER_AUTHORIZATION_UNAVAILABLE", "Server-side PAPER execution grants are disabled.", 403);
    }
    const record = this.requireAvailable(userId);
    if (!simulationSessionId || record.simulationSessionId !== simulationSessionId) {
      throw new ServerPaperRuntimeError("PAPER_SESSION_OWNERSHIP_MISMATCH", "The requested session is not the owner's current available PAPER session.", 403);
    }
    record.orderExecutionAuthorized = true;
    return { authorized: true, simulationSessionId };
  }

  /** Revocation is also exact-session and fails closed if the runtime has changed. */
  revokeOrderExecution(userId: number, simulationSessionId: string): { authorized: false; simulationSessionId: string } {
    validUserId(userId);
    const record = this.sessions.get(userId);
    if (!record || record.simulationSessionId !== simulationSessionId) {
      throw new ServerPaperRuntimeError("PAPER_SESSION_OWNERSHIP_MISMATCH", "The requested session is not the owner's current PAPER session.", 403);
    }
    record.orderExecutionAuthorized = false;
    return { authorized: false, simulationSessionId };
  }

  private requireOrderExecutionAuthorization(userId: number, record: RuntimeRecord, expectedSessionId = record.simulationSessionId): void {
    if (!this.ordersEnabled || record.ownerUserId !== userId || record.lifecycle !== "AVAILABLE" || !expectedSessionId ||
        record.simulationSessionId !== expectedSessionId || record.orderExecutionAuthorized !== true) {
      throw new ServerPaperRuntimeError("PAPER_ORDER_SESSION_NOT_AUTHORIZED", "PAPER execution is not authorized for this owner and simulation session.", 403);
    }
  }

  async readSnapshot(userId: number): Promise<ServerPaperSnapshot> {
    validUserId(userId);
    const record = this.requireAvailable(userId);
    const account = await this.request(record, "simulation.get_account", this.requestTimeoutMs);
    const position = await this.request(record, "simulation.get_position", this.requestTimeoutMs);
    const accountSessionId = requireSessionId(account, "account read");
    const positionSessionId = requireSessionId(position, "position read");
    if (accountSessionId !== record.simulationSessionId || positionSessionId !== record.simulationSessionId) {
      record.orderExecutionAuthorized = false;
      record.lifecycle = "UNAVAILABLE";
      this.getRegistry().transition(record.durableRecordId, "UNAVAILABLE", { reason: "snapshot_session_identity_mismatch" });
      throw new ServerPaperRuntimeError("NAUTILUS_SESSION_ID_MISMATCH", "Nautilus account and position belong to a different simulation session.");
    }
    const accountRecord = account as Record<string, unknown>;
    const positionRecord = position as Record<string, unknown>;
    const accountId = typeof accountRecord.accountId === "string" ? accountRecord.accountId : null;
    this.getRegistry().transition(record.durableRecordId, "AVAILABLE", { accountId, reason: null });
    return {
      simulationSessionId: record.simulationSessionId!,
      account: accountRecord,
      position: positionRecord,
    };
  }

  /** Apply an explicitly historical Replay BBO to the native PAPER runtime. */
  async applyReplayMarketSnapshot(userId: number, snapshot: {
    source: "REPLAY_HISTORICAL";
    symbol: "BTCUSDT";
    marketType: "SPOT" | "PERPETUAL";
    bid: string;
    ask: string;
    bidSize: string;
    askSize: string;
    timestampMs: number;
  }): Promise<Record<string, unknown>> {
    const record = this.requireAvailable(userId);
    if (snapshot.source !== "REPLAY_HISTORICAL") {
      throw new ServerPaperRuntimeError("PAPER_REPLAY_SOURCE_INVALID", "Replay market snapshots must declare REPLAY_HISTORICAL provenance.", 400);
    }
    if (snapshot.marketType !== "PERPETUAL") {
      throw new ServerPaperRuntimeError("PAPER_REPLAY_MARKET_UNSUPPORTED", "Native Nautilus Replay currently supports perpetual snapshots only.", 400);
    }
    if (!Number.isSafeInteger(snapshot.timestampMs) || snapshot.timestampMs <= 0) {
      throw new ServerPaperRuntimeError("PAPER_REPLAY_TIMESTAMP_INVALID", "Replay market snapshot timestamp is invalid.", 400);
    }
    const result = await this.request(record, "simulation.apply_replay_snapshot", {
      snapshot: {
        provenance: "REPLAY_HISTORICAL",
        source: { venue: "BINANCE", marketType: "perpetual", symbol: "BTCUSDT" },
        simulationInstrument: { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP" },
        bid: snapshot.bid,
        ask: snapshot.ask,
        bidSize: snapshot.bidSize,
        askSize: snapshot.askSize,
        timestampMs: snapshot.timestampMs,
      },
    }, this.requestTimeoutMs);
    if (!result || typeof result !== "object") throw new ServerPaperRuntimeError("PAPER_REPLAY_SNAPSHOT_INVALID", "Nautilus returned an invalid Replay snapshot acknowledgement.");
    return result as Record<string, unknown>;
  }

  async readRuntimeStatus(userId: number): Promise<Record<string, unknown>> {
    const record = this.requireAvailable(userId);
    const status = await this.request(record, "simulation.status", this.requestTimeoutMs);
    const sessionId = requireSessionId(status, "status");
    if (sessionId !== record.simulationSessionId) {
      record.orderExecutionAuthorized = false;
      this.getRegistry().transition(record.durableRecordId, "UNAVAILABLE", { reason: "status_session_identity_mismatch" });
      record.lifecycle = "UNAVAILABLE";
      throw new ServerPaperRuntimeError("NAUTILUS_SESSION_ID_MISMATCH", "Nautilus status belongs to a different simulation session.");
    }
    return status as Record<string, unknown>;
  }

  async readOrders(userId: number): Promise<unknown[]> {
    const record = this.requireAvailable(userId);
    const result = await this.request(record, "simulation.list_orders", this.requestTimeoutMs);
    if (!Array.isArray(result) || result.some((item) => !item || typeof item !== "object" || (item as Record<string, unknown>).simulationSessionId !== record.simulationSessionId)) {
      throw new ServerPaperRuntimeError("NAUTILUS_ORDER_SNAPSHOT_INVALID", "Native order snapshot did not match the active simulation session.");
    }
    return result;
  }

  async readFills(userId: number): Promise<unknown[]> {
    const record = this.requireAvailable(userId);
    const result = await this.request(record, "simulation.list_fills", this.requestTimeoutMs);
    if (!Array.isArray(result) || result.some((item) => !item || typeof item !== "object" || (item as Record<string, unknown>).simulationSessionId !== record.simulationSessionId)) {
      throw new ServerPaperRuntimeError("NAUTILUS_FILL_SNAPSHOT_INVALID", "Native fill snapshot did not match the active simulation session.");
    }
    return result;
  }

  async readOrderEvents(userId: number): Promise<unknown[]> {
    const record = this.requireAvailable(userId);
    const result = await this.request(record, "simulation.list_order_events", this.requestTimeoutMs);
    if (!Array.isArray(result) || result.some((item) => !item || typeof item !== "object" || (item as Record<string, unknown>).simulationSessionId !== record.simulationSessionId)) {
      throw new ServerPaperRuntimeError("NAUTILUS_EVENT_SNAPSHOT_INVALID", "Native event snapshot did not match the active simulation session.");
    }
    return result;
  }

  async reconcileProtections(userId: number): Promise<Record<string, unknown>> {
    const record = this.requireAvailable(userId);
    const result = await this.request(record, "simulation.reconcile_protections", this.requestTimeoutMs);
    if (!result || typeof result !== "object") throw new ServerPaperRuntimeError("NAUTILUS_RECONCILIATION_INVALID", "Nautilus returned an invalid protection reconciliation status.");
    return result as Record<string, unknown>;
  }

  private onQuoteUpdate(observation: ServerPaperQuoteObservation | null, reason?: string): void {
    for (const record of this.sessions.values()) {
      if (record.lifecycle !== "AVAILABLE" || !record.simulationSessionId) continue;
      if (observation && record.lastAppliedQuoteSequence != null && typeof observation.sequence === "number" && Number.isSafeInteger(observation.sequence) &&
          observation.sequence <= record.lastAppliedQuoteSequence) continue;
      record.pendingQuoteObservation = observation;
      record.pendingQuoteUnavailableReason = observation ? null : (reason || "provider_unavailable");
      void this.flushQuoteUpdates(record);
    }
  }

  private async flushQuoteUpdates(record: RuntimeRecord): Promise<void> {
    if (record.quoteUpdateRunning || record.lifecycle !== "AVAILABLE") return;
    record.quoteUpdateRunning = true;
    try {
      while (record.lifecycle === "AVAILABLE" && record.pendingQuoteObservation !== undefined) {
        const observation = record.pendingQuoteObservation;
        const unavailableReason = record.pendingQuoteUnavailableReason;
        record.pendingQuoteObservation = undefined;
        record.pendingQuoteUnavailableReason = null;
        if (observation === null) {
          try {
            await this.request(record, "simulation.mark_market_data_unavailable", { reason: unavailableReason ?? "provider_unavailable" }, this.requestTimeoutMs);
          } catch {
            // A transport failure already moves the process to UNRECOVERED. A valid runtime remains guarded by its own freshness clock.
          }
          continue;
        }
        if (typeof observation.sequence === "number" && Number.isSafeInteger(observation.sequence) && record.lastAppliedQuoteSequence != null &&
            observation.sequence <= record.lastAppliedQuoteSequence) continue;
        try {
          await this.applyQuoteObservation(record.ownerUserId, record, observation);
        } catch {
          // Do not hide a native failure by fabricating a quote. The native freshness guard continues to block new exposure.
        }
      }
    } finally {
      record.quoteUpdateRunning = false;
      if (record.lifecycle === "AVAILABLE" && record.pendingQuoteObservation !== undefined) {
        void this.flushQuoteUpdates(record);
      }
    }
  }

  async applyFreshServerQuote(userId: number): Promise<Record<string, unknown>> {
    const record = this.requireAvailable(userId);
    if (!this.options.quoteProvider) {
      throw new ServerPaperRuntimeError("PAPER_MARKET_SOURCE_NOT_CONFIGURED", "No server-owned PERP quote provider is configured.", 503);
    }
    const observation = await this.options.quoteProvider(userId, record.simulationSessionId!);
    if (!observation) throw new ServerPaperRuntimeError("PAPER_MARKET_DATA_UNAVAILABLE", "The server PERP quote provider has no current BBO.", 409);

    return this.applyQuoteObservation(userId, record, observation);
  }

  private async applyQuoteObservation(
    userId: number,
    record: RuntimeRecord,
    observation: ServerPaperQuoteObservation,
  ): Promise<Record<string, unknown>> {

    const testSource = observation.source === "CONTROLLED_TEST_PERP_BBO";
    if (testSource && this.options.allowControlledTestQuotes !== true) {
      throw new ServerPaperRuntimeError("PAPER_MARKET_SOURCE_REJECTED", "Controlled test quotes are not allowed in this runtime.", 409);
    }
    if ((!REAL_PERP_SOURCES.has(observation.source) && !testSource) || observation.symbol !== "BTCUSDT" || observation.marketType !== "perpetual") {
      throw new ServerPaperRuntimeError("PAPER_MARKET_IDENTITY_MISMATCH", "The server quote is not a supported BTCUSDT perpetual observation.", 409);
    }
    const bid = finiteDecimal(observation.bid, "bid");
    const ask = finiteDecimal(observation.ask, "ask");
    const bidSize = finiteDecimal(observation.bidSize, "bidSize");
    const askSize = finiteDecimal(observation.askSize, "askSize");
    const now = Date.now();
    const observedAtMs = observation.observedAtMs;
    const sourceTimestampMs = observation.sourceTimestampMs;
    const upstreamAgeMs = observation.sourceAgeMs;
    if (bid <= 0 || ask <= bid || bidSize <= 0 || askSize <= 0 ||
        !Number.isSafeInteger(observedAtMs) || !Number.isSafeInteger(sourceTimestampMs) ||
        !Number.isFinite(upstreamAgeMs) || upstreamAgeMs < 0 || observedAtMs > now + 250 || sourceTimestampMs <= 0) {
      throw new ServerPaperRuntimeError("PAPER_MARKET_QUOTE_INVALID", "The server BBO values or timestamps are invalid.", 409);
    }
    const conservativeAgeMs = Math.ceil(upstreamAgeMs + Math.max(0, now - observedAtMs));
    if (conservativeAgeMs > MAX_EXECUTION_QUOTE_AGE_MS) {
      throw new ServerPaperRuntimeError("PAPER_MARKET_QUOTE_STALE", "The server BBO is stale; PAPER execution is blocked.", 409);
    }
    const expectedEndpoint = observation.source === "BINANCE_FAPI_REST_BOOKTICKER"
      ? "https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=BTCUSDT"
      : observation.source === "BINANCE_FAPI_WS_DEPTH"
        ? "wss://fstream.binance.com/ws/btcusdt@depth"
        : "test://controlled-perp-bbo";
    if (observation.endpoint !== expectedEndpoint) {
      throw new ServerPaperRuntimeError("PAPER_MARKET_PROVENANCE_INVALID", "The PERP quote endpoint does not match its declared source.", 409);
    }
    const provenance = {
      source: observation.source,
      instrument: "BTCUSDT-PERP",
      endpoint: observation.endpoint,
      sourceTimestampMs,
      observedAtMs: now,
      providerObservedAtMs: observedAtMs,
      ageMs: conservativeAgeMs,
    };
    const result = await this.request(record, "simulation.apply_server_quote", {
      marketDataSource: observation.source,
      instrument: "BTCUSDT-PERP",
      bestBidPrice: observation.bid,
      bestAskPrice: observation.ask,
      bestBidSize: observation.bidSize,
      bestAskSize: observation.askSize,
      sourceTimestampMs,
      sourceAgeMs: conservativeAgeMs,
      localAppliedTimestampMs: now,
      sequence: ++record.quoteSequence,
      provenance,
    }, this.requestTimeoutMs);
    const status = await this.readRuntimeStatus(userId);
    const marketData = status.marketData as Record<string, unknown> | undefined;
    const market = status.market as Record<string, unknown> | undefined;
    if (marketData?.sourceAvailable !== true || marketData.marketDataSource !== observation.source ||
        typeof marketData.sourceAgeMs !== "number" || marketData.sourceAgeMs > MAX_EXECUTION_QUOTE_AGE_MS ||
        market?.instrument !== "BTCUSDT-PERP" || Number(market.bestBid) !== bid || Number(market.bestAsk) !== ask) {
      throw new ServerPaperRuntimeError("PAPER_MARKET_NATIVE_APPLY_UNCONFIRMED", "Nautilus did not confirm application of the fresh server BBO.", 409);
    }
    if (Number.isSafeInteger(observation.sequence)) record.lastAppliedQuoteSequence = observation.sequence!;
    return { ...(result as Record<string, unknown>), source: observation.source, bid: observation.bid, ask: observation.ask, quoteAgeMs: marketData.sourceAgeMs, marketUpdatedAt: market.updatedAt };
  }

  async submitOrderCommand(
    userId: number,
    idempotencyKey: string,
    intent: Record<string, unknown>,
  ): Promise<{ command: DurablePaperCommand; created: boolean }> {
    recordShadowAuthorityBoundary("paperSubmit");
    recordShadowAuthorityBoundary("nautilusMutation");
    const record = this.requireAvailable(userId);
    this.requireOrderExecutionAuthorization(userId, record);
    if (intent.reduceOnly !== true && record.entryBlockedReason) {
      throw new ServerPaperRuntimeError("PAPER_ENTRY_BLOCKED_UNPROTECTED_POSITION", "A prior protected entry is not confirmed safe; new exposure is blocked until it is reconciled.", 409);
    }
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_KEY_INVALID", "A valid Idempotency-Key header is required.", 400);
    }
    const requestHash = createHash("sha256").update(stableJson(intent)).digest("hex");
    const inFlightKey = `${userId}:${record.simulationSessionId}:${idempotencyKey}`;
    const existingFlight = this.inFlightCommands.get(inFlightKey);
    if (existingFlight) {
      if (existingFlight.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different order intent.", 409);
      return existingFlight.promise;
    }
    const operation = this.submitOrderCommandOnce(userId, record, idempotencyKey, requestHash, intent);
    const wrapped = operation.finally(() => this.inFlightCommands.delete(inFlightKey));
    this.inFlightCommands.set(inFlightKey, { requestHash, promise: wrapped });
    return wrapped;
  }

  async closePositionCommand(
    userId: number,
    idempotencyKey: string,
  ): Promise<{ command: DurablePaperCommand; created: boolean }> {
    recordShadowAuthorityBoundary("paperSubmit");
    recordShadowAuthorityBoundary("nautilusMutation");
    const record = this.requireAvailable(userId);
    const simulationSessionId = record.simulationSessionId!;
    this.requireOrderExecutionAuthorization(userId, record, simulationSessionId);
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
      throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_KEY_INVALID", "A valid Idempotency-Key header is required.", 400);
    }
    const requestHash = createHash("sha256").update(stableJson({ operation: "CLOSE_POSITION", simulationSessionId })).digest("hex");
    const flightKey = `${userId}:${simulationSessionId}:${idempotencyKey}`;
    const existingFlight = this.inFlightCommands.get(flightKey);
    if (existingFlight) {
      if (existingFlight.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different PAPER command.", 409);
      return existingFlight.promise;
    }
    const prior = this.getRegistry().findCommand(userId, simulationSessionId, idempotencyKey);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different PAPER command.", 409);
      if (prior.status === "ACKNOWLEDGED") return { command: prior, created: false };
      const reconciled = await this.getClosePositionCommand(userId, idempotencyKey);
      if (reconciled?.status === "ACKNOWLEDGED") return { command: reconciled, created: false };
      throw new ServerPaperRuntimeError("PAPER_CLOSE_AMBIGUOUS", "The original close outcome is unconfirmed; inspect native state before any further command.", 409);
    }
    const operation = this.closePositionCommandOnce(userId, record, idempotencyKey, requestHash);
    const wrapped = operation.finally(() => this.inFlightCommands.delete(flightKey));
    this.inFlightCommands.set(flightKey, { requestHash, promise: wrapped });
    return wrapped;
  }

  async getClosePositionCommand(userId: number, idempotencyKey: string): Promise<DurablePaperCommand | null> {
    validUserId(userId);
    const session = this.getRegistry().latest(userId);
    if (!session?.simulationSessionId) return null;
    const command = this.getRegistry().findCommand(userId, session.simulationSessionId, idempotencyKey);
    if (!command || !command.clientOrderId.startsWith("web-close-")) return null;
    if (command.status === "ACKNOWLEDGED" || command.status === "REJECTED") return command;
    const record = this.sessions.get(userId);
    if (!record || record.lifecycle !== "AVAILABLE" || record.simulationSessionId !== session.simulationSessionId) return command;
    try {
      const nativeOrder = await this.request(record, "simulation.get_order", { clientOrderId: command.clientOrderId }, this.requestTimeoutMs);
      const snapshot = await this.readSnapshot(userId);
      const orders = await this.readOrders(userId) as Array<Record<string, unknown>>;
      const activeOrders = orders.filter((order) => ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"].includes(String(order.status).toUpperCase()));
      const listedOrder = orders.find((order) => order.clientOrderId === command.clientOrderId);
      const confirmedOrder = nativeOrder && typeof nativeOrder === "object"
        ? nativeOrder as Record<string, unknown>
        : listedOrder;
      if (confirmedOrder &&
          (!confirmedOrder.simulationSessionId || confirmedOrder.simulationSessionId === session.simulationSessionId) &&
          String(confirmedOrder.status).toUpperCase() === "FILLED" &&
          String(snapshot.position.side).toUpperCase() === "FLAT" && Number(snapshot.position.quantity) === 0 && activeOrders.length === 0) {
        return this.getRegistry().transitionCommand(userId, session.simulationSessionId, idempotencyKey, "ACKNOWLEDGED", {
          response: { state: "CLOSED", simulationSessionId: session.simulationSessionId, order: confirmedOrder, position: snapshot.position, orders },
          reason: null,
        });
      }
    } catch {
      // Preserve the durable ambiguous state until a complete native read succeeds.
    }
    return command;
  }

  private async closePositionCommandOnce(
    userId: number,
    record: RuntimeRecord,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<{ command: DurablePaperCommand; created: boolean }> {
    const simulationSessionId = record.simulationSessionId!;
    const beforeQuote = await this.readSnapshot(userId);
    const beforeSide = String(beforeQuote.position.side).toUpperCase();
    const beforeQuantity = Number(beforeQuote.position.quantity);
    if (beforeSide === "FLAT" || !Number.isFinite(beforeQuantity) || beforeQuantity <= 0) {
      throw new ServerPaperRuntimeError("PAPER_CLOSE_REQUIRES_OPEN_POSITION", "There is no open PAPER position to close.", 409);
    }
    await this.applyFreshServerQuote(userId);
    this.requireOrderExecutionAuthorization(userId, record, simulationSessionId);
    const current = await this.readSnapshot(userId);
    if (String(current.position.side).toUpperCase() !== beforeSide || Number(current.position.quantity) !== beforeQuantity) {
      throw new ServerPaperRuntimeError("PAPER_POSITION_CHANGED_DURING_CLOSE", "The native position changed while refreshing its quote; re-read state before closing.", 409);
    }
    const ordersBefore = await this.readOrders(userId) as Array<Record<string, unknown>>;
    const active = ordersBefore.filter((order) => ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"].includes(String(order.status).toUpperCase()));
    if (active.some((order) => typeof order.protectionType !== "string")) {
      throw new ServerPaperRuntimeError("PAPER_CLOSE_HAS_OTHER_OPEN_ORDERS", "Cancel or reconcile other open orders before closing the PAPER position.", 409);
    }
    const clientOrderId = `web-close-${createHash("sha256").update(`${userId}:${simulationSessionId}:${idempotencyKey}`).digest("hex").slice(0, 24)}`;
    const registry = this.getRegistry();
    let reservation: { command: DurablePaperCommand; created: boolean };
    try {
      reservation = registry.reserveCommand({ ownerUserId: userId, simulationSessionId, idempotencyKey, requestHash, clientOrderId });
    } catch (error) {
      throw new ServerPaperRuntimeError("PAPER_CLOSE_RESERVATION_FAILED", error instanceof Error ? error.message : "Could not reserve the close command.", 503);
    }
    if (!reservation.created) {
      if (reservation.command.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different PAPER command.", 409);
      if (reservation.command.status === "ACKNOWLEDGED") return { command: reservation.command, created: false };
      throw new ServerPaperRuntimeError("PAPER_CLOSE_AMBIGUOUS", "The close was already reserved but is not confirmed; inspect native state before any further command.", 409);
    }
    try {
      this.requireOrderExecutionAuthorization(userId, record, simulationSessionId);
      const response = await this.request(record, "simulation.close_position", {
        clientOrderId,
        instrument: {
          venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP",
          baseAsset: "BTC", quoteAsset: "USDT", exchangeNativeSymbol: "BTCUSDT",
        },
      }, this.requestTimeoutMs);
      if (!response || typeof response !== "object" || (response as Record<string, unknown>).simulationSessionId !== simulationSessionId ||
          (response as Record<string, unknown>).clientOrderId !== clientOrderId) {
        throw new Error("native close response did not confirm its command and session identity");
      }
      const finalSnapshot = await this.readSnapshot(userId);
      const finalOrders = await this.readOrders(userId) as Array<Record<string, unknown>>;
      const activeOrders = finalOrders.filter((order) => ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"].includes(String(order.status).toUpperCase()));
      if (String((response as Record<string, unknown>).status).toUpperCase() !== "FILLED" ||
          String(finalSnapshot.position.side).toUpperCase() !== "FLAT" || Number(finalSnapshot.position.quantity) !== 0 || activeOrders.length > 0) {
        throw new Error("native close, FLAT position, or terminal-order cleanup was not fully confirmed");
      }
      const command = registry.transitionCommand(userId, simulationSessionId, idempotencyKey, "ACKNOWLEDGED", {
        response: { state: "CLOSED", simulationSessionId, order: response as Record<string, unknown>, position: finalSnapshot.position, orders: finalOrders },
        reason: null,
      });
      return { command, created: true };
    } catch (error) {
      record.orderExecutionAuthorized = false;
      const ambiguous = registry.transitionCommand(userId, simulationSessionId, idempotencyKey, "AMBIGUOUS", {
        response: { state: "CLOSE_UNCONFIRMED", simulationSessionId, clientOrderId },
        reason: error instanceof Error ? error.message.slice(0, 300) : "native_close_outcome_unconfirmed; automatic_resend_blocked",
      });
      // The mutation may have completed even when the response boundary was
      // late or incomplete. Reconcile by native reads before surfacing an
      // ambiguous result; never resubmit the close command.
      const reconciled = await this.getClosePositionCommand(userId, idempotencyKey).catch(() => null);
      if (reconciled?.status === "ACKNOWLEDGED") return { command: reconciled, created: true };
      void ambiguous;
      throw new ServerPaperRuntimeError("PAPER_CLOSE_AMBIGUOUS", "The close outcome or protection cleanup is unconfirmed. New execution is disabled until native state is reconciled.", 409);
    }
  }

  /**
   * One idempotent server command for a market entry and its two native
   * reduce-only protections. Nautilus remains the only OCO/reconciliation
   * implementation. A partial outcome is durably ambiguous and freezes new
   * exposure; this method never retries an uncertain leg automatically.
   */
  async submitProtectedEntryCommand(
    userId: number,
    idempotencyKey: string,
    input: { side: "BUY" | "SELL"; quantity: string; stopLoss: string; takeProfit: string },
  ): Promise<{ command: DurablePaperCommand; created: boolean }> {
    const record = this.requireAvailable(userId);
    this.requireOrderExecutionAuthorization(userId, record);
    if (!(input.side === "BUY" || input.side === "SELL") || !decimalTextHasPrecision(input.quantity, 3) ||
        !decimalTextHasPrecision(input.stopLoss, 2) || !decimalTextHasPrecision(input.takeProfit, 2)) {
      throw new ServerPaperRuntimeError("PAPER_PROTECTED_ENTRY_INVALID_DECIMAL", "Quantity must match the simulation size precision and SL/TP the price precision.", 400);
    }
    if (!/^[A-Za-z0-9._:-]{8,90}$/.test(idempotencyKey)) {
      throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_KEY_INVALID", "A valid Idempotency-Key header is required.", 400);
    }
    const request = { side: input.side, orderType: "MARKET", quantity: input.quantity, stopLoss: input.stopLoss, takeProfit: input.takeProfit };
    const requestHash = createHash("sha256").update(stableJson(request)).digest("hex");
    const flightKey = `${userId}:${record.simulationSessionId}:${idempotencyKey}`;
    const flight = this.inFlightProtectedEntries.get(flightKey);
    if (flight) {
      if (flight.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different protected entry.", 409);
      return flight.promise;
    }
    const prior = this.getRegistry().findCommand(userId, record.simulationSessionId!, idempotencyKey);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different protected entry.", 409);
      if (prior.status === "ACKNOWLEDGED") return Promise.resolve({ command: prior, created: false });
      throw new ServerPaperRuntimeError("PAPER_PROTECTED_ENTRY_AMBIGUOUS", "The original protected-entry outcome is incomplete or unconfirmed; automatic resend is blocked.", 409);
    }
    const sessionFlightKey = `${userId}:${record.simulationSessionId}`;
    const previous = this.protectedEntrySessionTails.get(sessionFlightKey) ?? Promise.resolve(null as unknown as { command: DurablePaperCommand; created: boolean });
    const operation = previous.catch(() => null as unknown as { command: DurablePaperCommand; created: boolean })
      .then(() => this.submitProtectedEntryCommandOnce(userId, record, idempotencyKey, requestHash, input));
    const wrapped = operation.finally(() => {
      this.inFlightProtectedEntries.delete(flightKey);
      if (this.protectedEntrySessionTails.get(sessionFlightKey) === wrapped) this.protectedEntrySessionTails.delete(sessionFlightKey);
    });
    this.inFlightProtectedEntries.set(flightKey, { requestHash, promise: wrapped });
    this.protectedEntrySessionTails.set(sessionFlightKey, wrapped);
    return wrapped;
  }

  async getProtectedEntryCommand(userId: number, idempotencyKey: string): Promise<DurablePaperCommand | null> {
    validUserId(userId);
    const session = this.getRegistry().latest(userId);
    if (!session?.simulationSessionId) return null;
    return this.getRegistry().findCommand(userId, session.simulationSessionId, idempotencyKey);
  }

  private async submitProtectedEntryCommandOnce(
    userId: number,
    record: RuntimeRecord,
    idempotencyKey: string,
    requestHash: string,
    input: { side: "BUY" | "SELL"; quantity: string; stopLoss: string; takeProfit: string },
  ): Promise<{ command: DurablePaperCommand; created: boolean }> {
    const sessionId = record.simulationSessionId!;
    const registry = this.getRegistry();
    const prior = registry.findCommand(userId, sessionId, idempotencyKey);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different protected entry.", 409);
      if (prior.status === "ACKNOWLEDGED") return { command: prior, created: false };
      throw new ServerPaperRuntimeError("PAPER_PROTECTED_ENTRY_AMBIGUOUS", "The original protected-entry outcome is incomplete or unconfirmed; automatic resend is blocked.", 409);
    }
    if (record.entryBlockedReason) {
      throw new ServerPaperRuntimeError("PAPER_ENTRY_BLOCKED_UNPROTECTED_POSITION", "A prior protected entry is not confirmed safe; new exposure is blocked until it is reconciled.", 409);
    }
    const positionBefore = (await this.readSnapshot(userId)).position;
    if (String(positionBefore.side).toUpperCase() !== "FLAT" || Number(positionBefore.quantity) !== 0) {
      throw new ServerPaperRuntimeError("PAPER_PROTECTED_ENTRY_REQUIRES_FLAT", "A protected entry can only start from a confirmed FLAT position.", 409);
    }
    const quoteResult = await this.applyFreshServerQuote(userId);
    const bid = finiteDecimal(quoteResult.bid, "bid");
    const ask = finiteDecimal(quoteResult.ask, "ask");
    const stop = finiteDecimal(input.stopLoss, "stopLoss");
    const take = finiteDecimal(input.takeProfit, "takeProfit");
    const validLevels = input.side === "BUY" ? stop < bid && take > ask : take < bid && stop > ask;
    if (!validLevels) throw new ServerPaperRuntimeError("PAPER_PROTECTION_LEVELS_INVALID", "SL and TP must be on the protective sides of the fresh PERP BBO.", 400);
    this.requireOrderExecutionAuthorization(userId, record, sessionId);
    const clientOrderId = `web-protected-${createHash("sha256").update(`${userId}:${sessionId}:${idempotencyKey}`).digest("hex").slice(0, 24)}`;
    let reservation: { command: DurablePaperCommand; created: boolean };
    try {
      reservation = registry.reserveCommand({ ownerUserId: userId, simulationSessionId: sessionId, idempotencyKey, requestHash, clientOrderId });
    } catch (error) {
      throw new ServerPaperRuntimeError("PAPER_PROTECTED_ENTRY_RESERVATION_FAILED", error instanceof Error ? error.message : "Could not reserve protected entry.", 503);
    }
    if (!reservation.created) {
      if (reservation.command.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different protected entry.", 409);
      if (reservation.command.status === "ACKNOWLEDGED") return { command: reservation.command, created: false };
      throw new ServerPaperRuntimeError("PAPER_PROTECTED_ENTRY_AMBIGUOUS", "The original protected-entry outcome is incomplete or unconfirmed; automatic resend is blocked.", 409);
    }

    const opposite = input.side === "BUY" ? "SELL" : "BUY";
    const groupId = `web-protection-${createHash("sha256").update(`${sessionId}:${idempotencyKey}`).digest("hex").slice(0, 24)}`;
    const legKeys = { entry: `${idempotencyKey}:entry`, sl: `${idempotencyKey}:sl`, tp: `${idempotencyKey}:tp` };
    let entry: Record<string, unknown> | null = null;
    let stopOrder: Record<string, unknown> | null = null;
    let takeOrder: Record<string, unknown> | null = null;
    try {
      this.requireOrderExecutionAuthorization(userId, record, sessionId);
      const entryResult = await this.submitOrderCommand(userId, legKeys.entry, { side: input.side, orderType: "MARKET", quantity: input.quantity, reduceOnly: false });
      entry = entryResult.command.response;
      let entryStatus = String(entry?.status ?? "").toUpperCase();
      if (!["FILLED", "CANCELED", "CANCELLED", "REJECTED", "EXPIRED"].includes(entryStatus)) {
        const entryClientOrderId = typeof entry?.clientOrderId === "string" ? entry.clientOrderId : null;
        if (!entryClientOrderId) throw new Error("entry_order_id_missing_for_terminal_state_check");
        await this.request(record, "simulation.cancel_order", { clientOrderId: entryClientOrderId }, this.requestTimeoutMs);
        const finalEntry = await this.request(record, "simulation.get_order", { clientOrderId: entryClientOrderId }, this.requestTimeoutMs);
        if (!finalEntry || typeof finalEntry !== "object" || (finalEntry as Record<string, unknown>).simulationSessionId !== sessionId) {
          throw new Error("entry_cancel_terminal_state_unconfirmed");
        }
        entry = finalEntry as Record<string, unknown>;
        entryStatus = String(entry.status ?? "").toUpperCase();
      }
      if (!["FILLED", "CANCELED", "CANCELLED", "REJECTED", "EXPIRED"].includes(entryStatus)) {
        throw new Error("entry_order_remains_nonterminal; unprotected exposure possible");
      }
      const snapshot = await this.readSnapshot(userId);
      const position = snapshot.position;
      const positionId = typeof position.positionId === "string"
        ? position.positionId
        : (typeof entry?.positionId === "string" ? entry.positionId : null);
      const positionSide = String(position.side).toUpperCase();
      const requestedQty = Number(input.quantity);
      const openQty = Number(position.quantity);
      if (positionSide === "FLAT" && openQty === 0 && ["CANCELED", "CANCELLED", "REJECTED", "EXPIRED"].includes(entryStatus)) {
        const response = { state: "ENTRY_NOT_FILLED", simulationSessionId: sessionId, protectionGroupId: groupId, entry, protections: { stopLoss: null, takeProfit: null } };
        const command = registry.transitionCommand(userId, sessionId, idempotencyKey, "REJECTED", { response, reason: "entry_did_not_fill; no exposure opened" });
        return { command, created: true };
      }
      if (!positionId || !["FILLED", "CANCELED", "CANCELLED"].includes(entryStatus) ||
          positionSide !== (input.side === "BUY" ? "LONG" : "SHORT") || !Number.isFinite(openQty) || openQty <= 0 || openQty > requestedQty ||
          Math.abs(Number(entry?.filledQuantity ?? openQty) - openQty) > 1e-9) {
        throw new Error("entry_fill_or_position_not_fully_confirmed; unprotected exposure possible");
      }
      const qty = String(position.quantity);
      await this.options.protectedEntryBeforeLeg?.("STOP_LOSS");
      const stopResult = await this.submitOrderCommand(userId, legKeys.sl, {
        side: opposite, orderType: "STOP_MARKET", quantity: qty, triggerPrice: input.stopLoss, reduceOnly: true,
        metadata: { protectionType: "STOP_LOSS", protectionGroupId: groupId },
      });
      stopOrder = stopResult.command.response;
      await this.options.protectedEntryBeforeLeg?.("TAKE_PROFIT");
      const takeResult = await this.submitOrderCommand(userId, legKeys.tp, {
        side: opposite, orderType: "LIMIT", quantity: qty, price: input.takeProfit, reduceOnly: true,
        metadata: { protectionType: "TAKE_PROFIT", protectionGroupId: groupId },
      });
      takeOrder = takeResult.command.response;
      const orders = await this.readOrders(userId) as Array<Record<string, unknown>>;
      const slConfirmed = orders.some((order) => order.clientOrderId === stopOrder?.clientOrderId && order.status === "ACCEPTED" && order.positionId === positionId && order.protectionGroupId === groupId && Number(order.quantity) === openQty);
      const tpConfirmed = orders.some((order) => order.clientOrderId === takeOrder?.clientOrderId && order.status === "ACCEPTED" && order.positionId === positionId && order.protectionGroupId === groupId && Number(order.quantity) === openQty);
      if (!slConfirmed || !tpConfirmed) throw new Error("native_protection_acceptance_or_linkage_unconfirmed");
      const response = { state: "PROTECTED", simulationSessionId: sessionId, positionId, protectionGroupId: groupId, entry, protections: { stopLoss: stopOrder, takeProfit: takeOrder } };
      const command = registry.transitionCommand(userId, sessionId, idempotencyKey, "ACKNOWLEDGED", { response, reason: null });
      return { command, created: true };
    } catch (error) {
      record.entryBlockedReason = "protected_entry_incomplete_or_ambiguous";
      const response = { state: "PROTECTION_INCOMPLETE", simulationSessionId: sessionId, protectionGroupId: groupId, entry, protections: { stopLoss: stopOrder, takeProfit: takeOrder } };
      registry.transitionCommand(userId, sessionId, idempotencyKey, "AMBIGUOUS", {
        response,
        reason: error instanceof Error ? error.message.slice(0, 300) : "protected_entry_incomplete_or_ambiguous",
      });
      throw new ServerPaperRuntimeError("PAPER_PROTECTED_ENTRY_INCOMPLETE", "The entry outcome or both native protections could not be confirmed. New exposure is blocked; inspect native orders before any further action.", 409);
    }
  }

  async getOrderCommand(userId: number, idempotencyKey: string): Promise<DurablePaperCommand | null> {
    validUserId(userId);
    const session = this.getRegistry().latest(userId);
    if (!session?.simulationSessionId) return null;
    const command = this.getRegistry().findCommand(userId, session.simulationSessionId, idempotencyKey);
    if (!command || command.status === "ACKNOWLEDGED" || command.status === "REJECTED") return command;
    const record = this.sessions.get(userId);
    if (!record || record.lifecycle !== "AVAILABLE") return command;
    try {
      const nativeOrder = await this.request(record, "simulation.get_order", { clientOrderId: command.clientOrderId }, this.requestTimeoutMs);
      if (!nativeOrder || typeof nativeOrder !== "object" || (nativeOrder as Record<string, unknown>).simulationSessionId !== session.simulationSessionId) {
        throw new Error("native order query did not confirm this command session");
      }
      return this.getRegistry().transitionCommand(userId, session.simulationSessionId, idempotencyKey, "ACKNOWLEDGED", { response: nativeOrder as Record<string, unknown>, reason: null });
    } catch {
      return this.getRegistry().transitionCommand(userId, session.simulationSessionId, idempotencyKey, "AMBIGUOUS", { reason: "native_order_state_not_confirmed; automatic_resend_blocked" });
    }
  }

  async stopForUser(userId: number): Promise<{ lifecycle: "TERMINATED"; simulationSessionId: string }> {
    validUserId(userId);
    const record = this.requireAvailable(userId);
    record.orderExecutionAuthorized = false;
    await this.captureShutdownEvidence(userId, record);
    const stoppedSessionId = record.simulationSessionId!;
    // The supervisor owns both simulation.stop and daemon shutdown. Backend
    // disconnect is intentionally separate from this explicit stop path.
    record.lifecycle = "UNAVAILABLE";
    this.getRegistry().transition(record.durableRecordId, "UNAVAILABLE", { reason: "shutdown_pending" });
    const stopped = await this.request(record, "supervisor.stop", this.requestTimeoutMs);
    if (!stopped || typeof stopped !== "object" || (stopped as Record<string, unknown>).stopped !== true) {
      record.lifecycle = "UNRECOVERED";
      this.getRegistry().transition(record.durableRecordId, "UNRECOVERED", { reason: "shutdown_ack_missing" });
      record.child.kill();
      await this.waitForExit(record, 2_000).catch(() => undefined);
      throw new ServerPaperRuntimeError("NAUTILUS_SHUTDOWN_UNCONFIRMED", "The PAPER supervisor did not confirm daemon shutdown.");
    }
    try {
      await this.waitForExit(record, this.requestTimeoutMs);
    } catch {
      record.lifecycle = "UNRECOVERED";
      this.getRegistry().transition(record.durableRecordId, "UNRECOVERED", { reason: "supervisor_exit_unconfirmed_after_shutdown" });
      record.child.kill();
      throw new ServerPaperRuntimeError("NAUTILUS_SHUTDOWN_UNCONFIRMED", "The PAPER supervisor acknowledged shutdown but did not exit before the deadline.");
    }
    record.lifecycle = "TERMINATED";
    this.getRegistry().transition(record.durableRecordId, "TERMINATED", { reason: "controlled_shutdown_confirmed" });
    await rm(record.cwd, { recursive: true, force: true }).catch(() => undefined);
    return { lifecycle: "TERMINATED", simulationSessionId: stoppedSessionId };
  }

  /**
   * Preserve a read-only native snapshot before a controlled process stop.
   * Evidence is historical only: it never restores engine state and never
   * implies that a position closed or an order was cancelled.
   */
  private async captureShutdownEvidence(userId: number, record: RuntimeRecord): Promise<void> {
    const simulationSessionId = record.simulationSessionId;
    if (!simulationSessionId) throw new ServerPaperRuntimeError("PAPER_SESSION_ID_MISSING", "Cannot preserve shutdown evidence without a session identity.");
    const capturedAt = Date.now();
    const evidence: Record<string, unknown> = {
      kind: "PAPER_RUNTIME_SHUTDOWN_OBSERVATION",
      simulationSessionId,
      capturedAt,
      operationalStateRestored: false,
      positionClosureInferred: false,
      orderCancellationInferred: false,
      diagnostics: { daemonStderrTail: record.stderrTail.slice(-20).map(redactDaemonDiagnostic) },
      captures: {},
      failures: [],
    };
    let complete = true;
    const capture = async (name: string, read: () => Promise<unknown>) => {
      try {
        (evidence.captures as Record<string, unknown>)[name] = await read();
      } catch (error) {
        complete = false;
        const value = error as { code?: unknown; message?: unknown };
        (evidence.failures as Array<Record<string, string>>).push({
          operation: name,
          code: typeof value?.code === "string" ? value.code.slice(0, 120) : "READ_FAILED",
          message: typeof value?.message === "string" ? value.message.slice(0, 240) : "Native evidence read failed.",
        });
      }
    };
    await capture("status", () => this.readRuntimeStatus(userId));
    await capture("accountAndPosition", async () => this.readSnapshot(userId));
    await capture("orders", () => this.readOrders(userId));
    await capture("fills", () => this.readFills(userId));
    await capture("orderEvents", () => this.readOrderEvents(userId));
    this.getRegistry().recordShutdownEvidence({
      recordId: record.durableRecordId,
      ownerUserId: userId,
      simulationSessionId,
      capturedAt,
      complete,
      evidence,
    });
  }

  /** Backend shutdown only drops the control connection; the independent
   * supervisor and daemon remain alive for a later authenticated attach. */
  async disconnect(): Promise<void> {
    this.unsubscribeQuoteUpdates?.();
    for (const record of this.sessions.values()) {
      record.lifecycle = "TERMINATED";
      record.socket.end();
      record.lines.close();
      record.resolveExit();
    }
    this.sessions.clear();
    this.closeRegistry();
  }

  async dispose(): Promise<void> {
    if (this.packagePrewarmChild && this.packagePrewarmChild.exitCode == null) {
      const child = this.packagePrewarmChild;
      child.kill();
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
    }
    this.unsubscribeQuoteUpdates?.();
    await Promise.all([...this.sessions.entries()].map(async ([userId, record]) => {
      if (record.lifecycle === "AVAILABLE" && record.child.exitCode == null) {
        try {
          await this.stopForUser(userId);
        } catch {
          record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
          this.getRegistry().transition(record.durableRecordId, record.lifecycle, { reason: "supervisor_dispose_failed" });
          record.child.kill();
          const exited = await this.waitForExit(record, 2_000).then(() => true, () => false);
          if (exited) await rm(record.cwd, { recursive: true, force: true }).catch(() => undefined);
        }
      } else if (record.lifecycle !== "TERMINATED" && record.child.exitCode == null) {
        record.lifecycle = "UNRECOVERED";
        this.getRegistry().transition(record.durableRecordId, "UNRECOVERED", { reason: "supervisor_disposed_without_confirmed_session_state" });
        record.child.kill();
        const exited = await this.waitForExit(record, 2_000).then(() => true, () => false);
        if (exited) await rm(record.cwd, { recursive: true, force: true }).catch(() => undefined);
      }
    }));
    this.closeRegistry();
  }

  private supervisorMetadataPath(userId: number): string {
    const registryPath = this.options.registryPath ?? defaultServerPaperRegistryPath();
    return `${path.resolve(registryPath)}.supervisor-${userId}.json`;
  }

  private async readSupervisorMetadata(metadataPath: string): Promise<Record<string, unknown>> {
    const deadline = Date.now() + this.startTimeoutMs;
    while (Date.now() < deadline) {
      try {
        const parsed = JSON.parse(await readFile(metadataPath, "utf8")) as unknown;
        if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).supervisorPort === "number") return parsed as Record<string, unknown>;
      } catch { /* supervisor is still publishing its identity */ }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new ServerPaperRuntimeError("PAPER_SUPERVISOR_METADATA_MISSING", "The PAPER supervisor did not publish identity metadata before the startup deadline.");
  }

  private async connectSupervisor(metadata: Record<string, unknown>): Promise<Socket> {
    const port = typeof metadata.supervisorPort === "number" ? metadata.supervisorPort : 0;
    if (!Number.isInteger(port) || port <= 0 || port > 65535 || typeof metadata.supervisorToken !== "string") {
      throw new ServerPaperRuntimeError("PAPER_SUPERVISOR_METADATA_INVALID", "The PAPER supervisor identity metadata is incomplete.");
    }
    const socket = connect({ host: "127.0.0.1", port });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
    });
    return socket;
  }

  private async createSession(userId: number): Promise<{ simulationSessionId: string; alreadyRunning: boolean }> {
    if (this.activeSessionCount() >= this.maxSessions) {
      throw new ServerPaperRuntimeError("PAPER_RUNTIME_CAPACITY", "Server PAPER runtime capacity is full.", 429);
    }
    const runtimeRoot = path.resolve(this.options.runtimeRoot);
    const python = path.join(runtimeRoot, "python.exe");
    const daemon = path.resolve(this.options.daemonScriptPath ?? path.join(runtimeRoot, "daemon.py"));
    const supervisor = path.resolve(this.options.supervisorScriptPath ?? path.join(process.cwd(), "scripts", "nautilus_bridge", "supervisor.py"));
    const metadataPath = this.supervisorMetadataPath(userId);
    const { access } = await import("node:fs/promises");
    try {
      await access(python);
      await access(daemon);
      await access(supervisor);
    } catch {
      throw new ServerPaperRuntimeError("NAUTILUS_RUNTIME_PACKAGE_MISSING", "Packaged Nautilus runtime or repo supervisor is unavailable on this server.");
    }

    const registry = this.getRegistry();
    const durableRecordId = randomUUID();
    try {
      registry.reserve(userId, durableRecordId, this.maxSessions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "PAPER_SESSION_RESERVATION_FAILED";
      const known = {
        PAPER_RUNTIME_UNRECOVERED: "The previous server PAPER process was lost; its position and orders are unknown.",
        PAPER_RUNTIME_ALREADY_EXISTS: "A server PAPER session is already reserved for this owner.",
        PAPER_RUNTIME_CAPACITY: "Server PAPER runtime capacity is full.",
      } as const;
      const code = message in known ? message as keyof typeof known : "PAPER_SESSION_RESERVATION_FAILED";
      throw new ServerPaperRuntimeError(code, known[code as keyof typeof known] ?? "PAPER session reservation failed.", code === "PAPER_RUNTIME_CAPACITY" ? 429 : 409);
    }
    let cwd: string;
    let child: ChildProcess;
    let socket: Socket;
    let supervisorMetadata: Record<string, unknown>;
    try {
      cwd = await mkdtemp(path.join(tmpdir(), "gt-server-paper-supervisor-"));
      child = spawn(python, [supervisor, "--metadata", metadataPath, "--owner-user-id", String(userId), "--python", python, "--daemon", daemon, "--cwd", cwd], {
        cwd,
        env: runtimeEnvironment(cwd, this.options.allowControlledTestQuotes === true, this.options.daemonScriptPath != null),
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
        detached: true,
      });
      supervisorMetadata = await this.readSupervisorMetadata(metadataPath);
      socket = await this.connectSupervisor(supervisorMetadata);
    } catch (error) {
      registry.transition(durableRecordId, "TERMINATED", { reason: "supervisor_spawn_failed_before_session_start" });
      throw error instanceof ServerPaperRuntimeError ? error : new ServerPaperRuntimeError("NAUTILUS_START_FAILED", "Nautilus PAPER supervisor could not be launched.");
    }
    const lines = createInterface({ input: socket });
    let resolveExit!: () => void;
    const exitPromise = new Promise<void>((resolve) => { resolveExit = resolve; });
    const record: RuntimeRecord = {
      ownerUserId: userId,
      durableRecordId,
      child,
      socket,
      lines,
      cwd,
      supervisorMetadataPath: metadataPath,
      supervisorMetadata,
      lifecycle: "STARTING",
      simulationSessionId: null,
      orderExecutionAuthorized: false,
      inFlight: null,
      ignoredLateResponseIds: new Set(),
      requestTail: Promise.resolve(),
      exitPromise,
      resolveExit,
      stderrTail: [],
      queuedRequests: 0,
      quoteSequence: 0,
      lastAppliedQuoteSequence: null,
      quoteUpdateRunning: false,
      pendingQuoteObservation: undefined,
      pendingQuoteUnavailableReason: null,
      nautilusVersion: null,
      runtimeModules: null,
    };
    this.sessions.set(userId, record);

    lines.on("line", (line) => this.receiveLine(record, line));
    lines.on("error", (error) => record.inFlight?.reject(error));
    socket.on("error", (error) => record.inFlight?.reject(error));
    socket.on("close", () => {
      if (record.lifecycle === "STARTING" || record.lifecycle === "AVAILABLE") {
        record.orderExecutionAuthorized = false;
        record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
        registry.transition(record.durableRecordId, record.lifecycle, { reason: "supervisor_control_disconnect" });
      }
      record.inFlight?.reject(new Error("PAPER supervisor control connection closed."));
      record.resolveExit();
    });
    if (!child.stderr) throw new Error("supervisor stderr pipe unavailable");
    child.stderr.on("data", (chunk: Buffer | string) => {
      const value = String(chunk).trim();
      if (value) record.stderrTail.push(value.slice(0, 500));
      if (record.stderrTail.length > 20) record.stderrTail.shift();
    });
    child.once("error", (error) => {
      record.orderExecutionAuthorized = false;
      if (record.lifecycle === "STARTING" || record.lifecycle === "AVAILABLE") {
        record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
        registry.transition(record.durableRecordId, record.lifecycle, { reason: "daemon_process_error" });
      }
      record.inFlight?.reject(error);
      record.resolveExit();
    });
    child.once("exit", (code, signal) => {
      record.orderExecutionAuthorized = false;
      if (record.lifecycle === "STARTING" || record.lifecycle === "AVAILABLE") {
        record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
        registry.transition(record.durableRecordId, record.lifecycle, { reason: "daemon_process_exited_unexpectedly" });
      }
      record.inFlight?.reject(new Error("Nautilus daemon exited before responding."));
      console.error("[server-paper] Nautilus daemon exited", {
        pid: child.pid ?? null,
        code,
        signal,
        lifecycle: record.lifecycle,
        simulationSessionId: record.simulationSessionId,
        stderrTail: record.stderrTail.slice(-12),
      });
      record.resolveExit();
      lines.close();
    });

    try {
      const started = await this.request(record, "supervisor.start", this.startTimeoutMs);
      if (!started || typeof started !== "object") throw new ServerPaperRuntimeError("NAUTILUS_START_FAILED", "The PAPER supervisor returned no startup result.");
      const healthRecord = (started as Record<string, unknown>).health;
      if (!healthRecord || typeof healthRecord !== "object" || (healthRecord as Record<string, unknown>).status !== "healthy") {
        throw new ServerPaperRuntimeError("NAUTILUS_HEALTH_FAILED", "Nautilus daemon health check did not pass.");
      }
      if ((healthRecord as Record<string, unknown>).nautilusVersion !== "1.231.0") {
        throw new ServerPaperRuntimeError("NAUTILUS_PACKAGE_VERSION_MISMATCH", "The launched Nautilus daemon package has an unexpected engine version.");
      }
      record.runtimeModules = await this.verifyLoadedRuntimeModules((healthRecord as Record<string, unknown>).runtimeModules, runtimeRoot);
      record.nautilusVersion = "1.231.0";
      const sessionId = requireSessionId(started, "start");
      record.supervisorMetadata = (started as Record<string, unknown>).supervisor && typeof (started as Record<string, unknown>).supervisor === "object"
        ? (started as Record<string, unknown>).supervisor as Record<string, unknown>
        : record.supervisorMetadata;
      record.simulationSessionId = sessionId;
      registry.transition(record.durableRecordId, "STARTING", { simulationSessionId: sessionId });
      if ((started as Record<string, unknown>).sessionLifecycle !== "ACTIVE") {
        throw new ServerPaperRuntimeError("NAUTILUS_SESSION_NOT_ACTIVE", "Nautilus did not activate the new PAPER simulation.");
      }
      record.lifecycle = "AVAILABLE";
      registry.transition(record.durableRecordId, "AVAILABLE", { simulationSessionId: sessionId, reason: null });
      return { simulationSessionId: sessionId, alreadyRunning: false };
    } catch (error) {
      record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
      registry.transition(record.durableRecordId, record.lifecycle, { reason: "daemon_start_failed_or_ambiguous" });
      record.child.kill();
      const exited = await this.waitForExit(record, 2_000).then(() => true, () => false);
      if (exited) {
        await rm(record.cwd, { recursive: true, force: true }).catch(() => undefined);
        if (!record.simulationSessionId) registry.transition(record.durableRecordId, "TERMINATED", { reason: "startup_failed_before_identity" });
        if (!record.simulationSessionId) this.sessions.delete(userId);
      } else {
        record.orderExecutionAuthorized = false;
        record.lifecycle = "UNRECOVERED";
        registry.transition(record.durableRecordId, "UNRECOVERED", { reason: "daemon_start_cleanup_unconfirmed" });
        if (!record.simulationSessionId) {
          registry.recordUnrecoveredStartupAttempt({
            recordId: record.durableRecordId,
            ownerUserId: userId,
            simulationSessionId: null,
            lifecycle: "UNRECOVERED",
            position: "UNKNOWN",
            orders: "UNKNOWN",
            permissions: "NONE",
            commands: "NONE_SENT",
            reason: "daemon_start_cleanup_unconfirmed",
            cleanupConfirmed: false,
          });
        }
      }
      console.info("[server-paper] daemon startup cleanup result", {
        pid: child.pid ?? null,
        exitConfirmed: exited,
        exitCode: child.exitCode,
        signalCode: child.signalCode,
        killed: child.killed,
        simulationSessionIdObtained: record.simulationSessionId !== null,
        lifecycle: record.lifecycle,
      });
      throw error instanceof ServerPaperRuntimeError
        ? error
        : new ServerPaperRuntimeError("NAUTILUS_START_FAILED", "Nautilus server PAPER session failed to start.");
    }
  }

  private async verifyLoadedRuntimeModules(value: unknown, runtimeRoot: string): Promise<Record<string, { path: string; sha256: string }>> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new ServerPaperRuntimeError("NAUTILUS_PACKAGE_MANIFEST_MISSING", "The daemon did not report its imported runtime module hashes.");
    }
    const root = path.resolve(runtimeRoot);
    const manifest = value as Record<string, unknown>;
    const required = ["daemon", "contracts", "simulation_core", "simulation_service", "quote_stream"];
    const verified: Record<string, { path: string; sha256: string }> = {};
    for (const name of required) {
      const entry = manifest[name];
      if (!entry || typeof entry !== "object") {
        throw new ServerPaperRuntimeError("NAUTILUS_PACKAGE_MODULE_MISSING", `The daemon import manifest is missing ${name}.`);
      }
      const module = entry as Record<string, unknown>;
      if (typeof module.path !== "string" || typeof module.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(module.sha256)) {
        throw new ServerPaperRuntimeError("NAUTILUS_PACKAGE_MODULE_INVALID", `The daemon import manifest for ${name} is invalid.`);
      }
      const resolvedPath = path.resolve(module.path);
      const relative = path.relative(root, resolvedPath);
      if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new ServerPaperRuntimeError("NAUTILUS_PACKAGE_MODULE_OUTSIDE_ROOT", `The daemon imported ${name} outside the configured runtime package.`);
      }
      const digest = createHash("sha256").update(await readFile(resolvedPath)).digest("hex");
      if (digest.toLowerCase() !== module.sha256.toLowerCase()) {
        throw new ServerPaperRuntimeError("NAUTILUS_PACKAGE_HASH_MISMATCH", `The loaded daemon module hash for ${name} does not match its file.`);
      }
      verified[name] = { path: resolvedPath, sha256: digest };
    }
    return verified;
  }

  private async runPackagePreflight(): Promise<void> {
    const runtimeRoot = path.resolve(this.options.runtimeRoot);
    const python = path.join(runtimeRoot, "python.exe");
    const daemon = path.resolve(this.options.daemonScriptPath ?? path.join(runtimeRoot, "daemon.py"));
    const { access } = await import("node:fs/promises");
    await access(python);
    await access(daemon);
    const cwd = await mkdtemp(path.join(tmpdir(), "gt-server-paper-preflight-"));
    const startedAt = Date.now();
    const child = spawn(python, [daemon, "--preflight"], {
      cwd,
      env: runtimeEnvironment(cwd, false, this.options.daemonScriptPath != null),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.packagePrewarmChild = child;
    child.stdin.end();
    let stdout = "";
    const stderrTail: string[] = [];
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
      if (Buffer.byteLength(stdout, "utf8") > 1024 * 1024) child.kill();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        const value = redactDaemonDiagnostic(line.trim());
        if (value) stderrTail.push(value);
        if (stderrTail.length > 20) stderrTail.shift();
      }
    });
    let timeout: NodeJS.Timeout | undefined;
    let exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
    try {
      exitPromise = new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", (code, signal) => resolve({ code, signal }));
      });
      const result = await Promise.race([
        exitPromise,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("preflight exceeded its bounded 90-second deadline")), 90_000);
        }),
      ]);
      if (result.code !== 0) {
        throw new Error(`preflight exited code=${result.code} signal=${result.signal}; ${stderrTail.slice(-6).join(" | ")}`);
      }
      if (Buffer.byteLength(stdout, "utf8") > 1024 * 1024) throw new Error("preflight output exceeded 1 MiB");
      const lines = stdout.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
      if (lines.length === 0) throw new Error("preflight returned no response");
      let metadata: unknown;
      let parsedResponse = false;
      for (const line of lines) {
        try {
          const candidate = JSON.parse(line) as unknown;
          if (candidate && typeof candidate === "object" && (candidate as Record<string, unknown>).status === "ready") {
            metadata = candidate;
            parsedResponse = true;
          }
        } catch {
          // Ignore non-JSON diagnostic lines; the ready metadata below remains
          // authoritative after its version and module hashes are verified.
        }
      }
      if (!parsedResponse) throw new Error("preflight returned invalid JSON");
      if (!metadata || typeof metadata !== "object" ||
          (metadata as Record<string, unknown>).status !== "ready" ||
          (metadata as Record<string, unknown>).nautilusVersion !== "1.231.0") {
        throw new Error("preflight did not confirm the expected Nautilus package");
      }
      await this.verifyLoadedRuntimeModules((metadata as Record<string, unknown>).runtimeModules, runtimeRoot);
      console.info("[server-paper] runtime package preflight ready", { elapsedMs: Date.now() - startedAt, runtimeRoot });
    } catch (error) {
      if (child.exitCode == null) child.kill();
      const exited = child.exitCode != null || await Promise.race([
        (exitPromise?.then(() => true, () => true) ?? Promise.resolve(false)),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2_000)),
      ]);
      console.error("[server-paper] runtime package preflight cleanup", {
        pid: child.pid ?? null,
        exitCode: child.exitCode,
        signalCode: child.signalCode,
        exitConfirmed: exited,
        stderrTail: stderrTail.slice(-20),
      });
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      if (child.exitCode != null) await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
      if (this.packagePrewarmChild === child) this.packagePrewarmChild = null;
    }
  }

  private receiveLine(record: RuntimeRecord, line: string): void {
    const pending = record.inFlight;
    let response: WireResponse;
    if (Buffer.byteLength(line, "utf8") > 1024 * 1024) {
      pending?.reject(new Error("Nautilus daemon response exceeded the 1 MiB limit."));
      record.orderExecutionAuthorized = false;
      record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
      this.getRegistry().transition(record.durableRecordId, record.lifecycle, { reason: "daemon_response_size_limit" });
      record.child.kill();
      return;
    }
    try {
      response = JSON.parse(line) as WireResponse;
    } catch {
      record.orderExecutionAuthorized = false;
      record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
      this.getRegistry().transition(record.durableRecordId, record.lifecycle, { reason: "daemon_invalid_json_response" });
      record.child.kill();
      pending?.reject(new Error("Nautilus daemon returned invalid JSON."));
      return;
    }
    const responseId = typeof response.id === "string" ? response.id : null;
    if (responseId && record.ignoredLateResponseIds.delete(responseId)) {
      if (process.env.GOODTRADING_NAUTILUS_RPC_TRACE === "1") {
        console.info("[server-paper] ignored late native response", { op: "simulation.mark_market_data_unavailable", pid: record.child.pid ?? null });
      }
      return;
    }
    if (!pending) return;
    if (response.id !== pending.id) {
      record.orderExecutionAuthorized = false;
      record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
      this.getRegistry().transition(record.durableRecordId, record.lifecycle, { reason: "daemon_response_id_mismatch" });
      record.child.kill();
      pending.reject(new Error("Nautilus daemon response ID did not match the request."));
      return;
    }
    if (response.ok !== true) {
      if (process.env.GOODTRADING_NAUTILUS_RPC_TRACE === "1") {
        console.info("[server-paper] native RPC error response", { id: pending.id, code: response.error?.code ?? null, pid: record.child.pid ?? null });
      }
      pending.reject(new ServerPaperRuntimeError(
        typeof response.error?.code === "string" ? response.error.code : "NAUTILUS_REQUEST_FAILED",
        typeof response.error?.message === "string" ? response.error.message : "Nautilus request failed.",
      ));
      return;
    }
    if (process.env.GOODTRADING_NAUTILUS_RPC_TRACE === "1") {
      console.info("[server-paper] native RPC response received", { id: pending.id, pid: record.child.pid ?? null });
    }
    pending.resolve(response.result);
  }

  private request(
    record: RuntimeRecord,
    op: string,
    timeoutOrParams: number | Record<string, unknown> = this.requestTimeoutMs,
    requestTimeoutMs = this.requestTimeoutMs,
  ): Promise<unknown> {
    if (record.queuedRequests >= this.maxQueuedRequests) {
      return Promise.reject(new ServerPaperRuntimeError("NAUTILUS_REQUEST_QUEUE_FULL", "Nautilus PAPER request queue is full.", 429));
    }
    record.queuedRequests += 1;
    const params = typeof timeoutOrParams === "number" ? undefined : timeoutOrParams;
    const timeoutMs = typeof timeoutOrParams === "number" ? timeoutOrParams : requestTimeoutMs;
    const operation = record.requestTail.then(() => this.runRequest(record, op, params, timeoutMs));
    record.requestTail = operation.then(() => undefined, () => undefined);
    return operation.finally(() => { record.queuedRequests = Math.max(0, record.queuedRequests - 1); });
  }

  private runRequest(record: RuntimeRecord, op: string, params: Record<string, unknown> | undefined, timeoutMs: number): Promise<unknown> {
    if (record.child.exitCode != null || record.child.killed || record.socket.destroyed || !record.socket.writable) {
      return Promise.reject(new ServerPaperRuntimeError("NAUTILUS_PROCESS_UNAVAILABLE", "Nautilus PAPER supervisor is not running."));
    }
    if (op === "simulation.submit_order" &&
        (!this.ordersEnabled || !record.orderExecutionAuthorized || record.lifecycle !== "AVAILABLE" || !record.simulationSessionId)) {
      return Promise.reject(new ServerPaperRuntimeError("PAPER_ORDER_SESSION_NOT_AUTHORIZED", "PAPER execution is not authorized for this owner and simulation session.", 403));
    }
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (record.inFlight?.id !== id) return;
        record.inFlight = null;
        if (op === "simulation.mark_market_data_unavailable") {
          // Feed loss is already fail-closed by the server quote-age guard and
          // Nautilus' own freshness clock. A late metadata acknowledgement
          // must not be mistaken for the next RPC, and this idempotent marker
          // timing out must not destroy the simulation process.
          record.ignoredLateResponseIds.add(id);
          if (record.ignoredLateResponseIds.size > 64) {
            const oldest = record.ignoredLateResponseIds.values().next().value;
            if (oldest) record.ignoredLateResponseIds.delete(oldest);
          }
          console.error("[server-paper] native feed-unavailable marker exceeded its deadline", {
            pid: record.child.pid ?? null,
            simulationSessionId: record.simulationSessionId,
            queuedRequests: record.queuedRequests,
            childExitCode: record.child.exitCode,
            childSignalCode: record.child.signalCode,
            stderrTail: record.stderrTail.slice(-8),
          });
          reject(new ServerPaperRuntimeError("NAUTILUS_MARKET_UNAVAILABLE_ACK_TIMEOUT", "Nautilus did not acknowledge the feed-unavailable marker before its deadline; the runtime was preserved and new exposure remains blocked."));
          return;
        }
        record.orderExecutionAuthorized = false;
        record.lifecycle = record.simulationSessionId ? "UNRECOVERED" : "UNAVAILABLE";
        this.getRegistry().transition(record.durableRecordId, record.lifecycle, { reason: `native_request_timeout:${op}` });
        console.error("[server-paper] native request exceeded its deadline; terminating unresponsive daemon", {
          op,
          pid: record.child.pid ?? null,
          simulationSessionId: record.simulationSessionId,
          queuedRequests: record.queuedRequests,
          childExitCode: record.child.exitCode,
          childSignalCode: record.child.signalCode,
          stderrTail: record.stderrTail.slice(-8),
        });
        reject(new ServerPaperRuntimeError("NAUTILUS_REQUEST_TIMEOUT", `Nautilus ${op} request exceeded its deadline.`));
        record.child.kill();
      }, timeoutMs);
      record.inFlight = {
        id,
        timeout,
        resolve: (result) => {
          clearTimeout(timeout);
          record.inFlight = null;
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timeout);
          record.inFlight = null;
          reject(error);
        },
      };
      if (process.env.GOODTRADING_NAUTILUS_RPC_TRACE === "1") {
        console.info("[server-paper] native RPC sent", { op, id, pid: record.child.pid ?? null, queuedRequests: record.queuedRequests });
      }
      record.socket.write(`${JSON.stringify({ id, token: record.supervisorMetadata.supervisorToken, op, ...(params ? { params } : {}) })}\n`, (error) => {
        if (error && record.inFlight?.id === id) record.inFlight.reject(error);
      });
    });
  }

  private requireAvailable(userId: number): RuntimeRecord {
    const record = this.sessions.get(userId);
    if (!record || record.lifecycle !== "AVAILABLE" || !record.simulationSessionId) {
      if (record?.lifecycle === "UNRECOVERED") {
        throw new ServerPaperRuntimeError("PAPER_RUNTIME_UNRECOVERED", "The server PAPER runtime was lost; position and orders are unknown.", 409);
      }
      throw new ServerPaperRuntimeError("PAPER_RUNTIME_UNAVAILABLE", "No available server PAPER runtime exists for this user.");
    }
    return record;
  }

  private waitForExit(record: RuntimeRecord, timeoutMs: number): Promise<void> {
    if (record.child.exitCode != null) return Promise.resolve();
    let timeout: NodeJS.Timeout;
    return Promise.race([
      record.exitPromise,
      new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Nautilus daemon did not exit before the cleanup deadline.")), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timeout!));
  }

  private activeSessionCount(): number {
    return [...this.sessions.values()].filter((record) =>
      record.lifecycle === "STARTING" || record.lifecycle === "AVAILABLE" || record.lifecycle === "UNRECOVERED",
    ).length;
  }

  private getRegistry(): ServerPaperSessionRegistry {
    if (this.registry) return this.registry;
    const registryPath = this.options.registryPath ?? defaultServerPaperRegistryPath();
    this.registry = new ServerPaperSessionRegistry(registryPath);
    return this.registry;
  }

  closeRegistry(): void {
    this.registry?.close();
    this.registry = null;
  }

  private async submitOrderCommandOnce(
    userId: number,
    record: RuntimeRecord,
    idempotencyKey: string,
    requestHash: string,
    intent: Record<string, unknown>,
  ): Promise<{ command: DurablePaperCommand; created: boolean }> {
    const simulationSessionId = record.simulationSessionId!;
    this.requireOrderExecutionAuthorization(userId, record, simulationSessionId);
    const prior = this.getRegistry().findCommand(userId, simulationSessionId, idempotencyKey);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_CONFLICT", "This key was already used with a different order intent.", 409);
      if (prior.status === "ACKNOWLEDGED") return { command: prior, created: false };
      if (prior.status === "REJECTED") throw new ServerPaperRuntimeError("PAPER_ORDER_REJECTED", "The original command was rejected; use a new idempotency key for a new intent.", 409);
      const reconciled = await this.getOrderCommand(userId, idempotencyKey);
      if (reconciled?.status === "ACKNOWLEDGED") return { command: reconciled, created: false };
      throw new ServerPaperRuntimeError("PAPER_ORDER_AMBIGUOUS", "Native order state is not confirmed; automatic resend is blocked.", 409);
    }
    await this.applyFreshServerQuote(userId);
    // The quote fetch is asynchronous; a server-side revocation or session
    // lifecycle change during that await must be honored before native submit.
    this.requireOrderExecutionAuthorization(userId, record, simulationSessionId);
    const digest = createHash("sha256").update(`${userId}:${simulationSessionId}:${idempotencyKey}`).digest("hex");
    const clientOrderId = `web-${digest.slice(0, 32)}`;
    let reservation: { command: DurablePaperCommand; created: boolean };
    try {
      reservation = this.getRegistry().reserveCommand({
        ownerUserId: userId,
        simulationSessionId,
        idempotencyKey,
        requestHash,
        clientOrderId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "PAPER_IDEMPOTENCY_RESERVATION_FAILED";
      if (message === "PAPER_IDEMPOTENCY_CONFLICT") throw new ServerPaperRuntimeError(message, "This key was already used with a different order intent.", 409);
      throw new ServerPaperRuntimeError("PAPER_IDEMPOTENCY_RESERVATION_FAILED", "The server could not reserve this PAPER command.", 503);
    }
    if (!reservation.created) {
      if (reservation.command.status === "ACKNOWLEDGED") return { command: reservation.command, created: false };
      if (reservation.command.status === "REJECTED") throw new ServerPaperRuntimeError("PAPER_ORDER_REJECTED", "The original command was rejected; use a new idempotency key for a new intent.", 409);
      const reconciled = await this.getOrderCommand(userId, idempotencyKey);
      if (reconciled?.status === "ACKNOWLEDGED") return { command: reconciled, created: false };
      throw new ServerPaperRuntimeError("PAPER_ORDER_AMBIGUOUS", "Native order state is not confirmed; automatic resend is blocked.", 409);
    }

    const nativeIntent = {
      ...intent,
      clientOrderId,
      instrument: {
        venue: "SIM",
        marketType: "perpetual",
        symbol: "BTCUSDT-PERP",
        baseAsset: "BTC",
        quoteAsset: "USDT",
        exchangeNativeSymbol: "BTCUSDT",
      },
    };
    try {
      this.requireOrderExecutionAuthorization(userId, record, simulationSessionId);
      const response = await this.request(record, "simulation.submit_order", nativeIntent, this.requestTimeoutMs);
      if (!response || typeof response !== "object" || (response as Record<string, unknown>).simulationSessionId !== simulationSessionId) {
        throw new Error("native submit response did not confirm its session identity");
      }
      const command = this.getRegistry().transitionCommand(userId, simulationSessionId, idempotencyKey, "ACKNOWLEDGED", {
        response: response as Record<string, unknown>, reason: null,
      });
      return { command, created: true };
    } catch (error) {
      const explicitNativeRejection = error instanceof ServerPaperRuntimeError &&
        !["NAUTILUS_REQUEST_TIMEOUT", "NAUTILUS_PROCESS_UNAVAILABLE", "NAUTILUS_START_FAILED"].includes(error.code);
      const command = this.getRegistry().transitionCommand(
        userId,
        simulationSessionId,
        idempotencyKey,
        explicitNativeRejection ? "REJECTED" : "AMBIGUOUS",
        { reason: explicitNativeRejection ? `native_rejection:${(error as ServerPaperRuntimeError).code}` : "native_submit_outcome_unconfirmed; automatic_resend_blocked" },
      );
      if (!explicitNativeRejection) {
        throw new ServerPaperRuntimeError("PAPER_ORDER_AMBIGUOUS", "Native order state is not confirmed; automatic resend is blocked.", 409);
      }
      throw new ServerPaperRuntimeError("PAPER_ORDER_REJECTED", "Nautilus rejected the PAPER order.", 409);
    }
  }
}
