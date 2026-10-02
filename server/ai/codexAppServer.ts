import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

export type CodexStatus = "DISCONNECTED" | "AUTH_REQUIRED" | "STARTING" | "READY" | "RECONNECT_REQUIRED" | "RATE_LIMITED" | "UNAVAILABLE" | "ERROR";
type RpcMessage = { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
export type CodexConnectResult = {
  status: "CONNECTED" | "AUTHORIZATION_REQUIRED" | "PENDING";
  provider: "openai-codex";
  accountConnected: boolean;
  models: string[];
  loginId?: string;
  authorizationUrl?: string;
  verificationUri?: string;
  userCode?: string;
  deviceCode?: string;
};
export type CodexTiming = { controlRpcTimeoutMs?: number; turnTimeoutMs?: number; inactivityTimeoutMs?: number };
const effortFor = (quality?: string) => quality === "HIGH" ? "high" : quality === "LOW" ? "low" : "medium";
export const CODEX_CONTROL_RPC_TIMEOUT_MS = 15_000;
export const CODEX_TURN_TIMEOUT_MS = 120_000;
export const CODEX_TURN_INACTIVITY_TIMEOUT_MS = 30_000;
function normalizeLoginResponse(value: unknown, models: string[]): CodexConnectResult {
  const root = (value && typeof value === "object" && "root" in value ? (value as { root?: unknown }).root : value) as Record<string, unknown> | null;
  const authorizationUrl = typeof root?.authorizationUrl === "string" ? root.authorizationUrl : typeof root?.authUrl === "string" ? root.authUrl : undefined;
  const verificationUri = typeof root?.verificationUri === "string" ? root.verificationUri : typeof root?.verificationUrl === "string" ? root.verificationUrl : undefined;
  const userCode = typeof root?.userCode === "string" ? root.userCode : undefined;
  const deviceCode = typeof root?.deviceCode === "string" ? root.deviceCode : undefined;
  const loginId = typeof root?.loginId === "string" ? root.loginId : undefined;
  return { status: authorizationUrl || verificationUri || userCode || deviceCode ? "AUTHORIZATION_REQUIRED" : "PENDING", provider: "openai-codex", accountConnected: false, models, loginId, authorizationUrl, verificationUri, userCode, deviceCode };
}

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(message: RpcMessage) => void>();
  private threads = new Map<string, string>();
  private initialized = false;
  private status: CodexStatus = "DISCONNECTED";
  private account: unknown = null;
  private models: string[] = [];
  private readonly timing: Required<CodexTiming>;
  constructor(private readonly command = process.env.CODEX_BINARY_PATH?.trim() || "codex", private readonly commandArgs = ["app-server", "--stdio"], timing: CodexTiming = {}) {
    this.timing = {
      controlRpcTimeoutMs: timing.controlRpcTimeoutMs ?? CODEX_CONTROL_RPC_TIMEOUT_MS,
      turnTimeoutMs: timing.turnTimeoutMs ?? CODEX_TURN_TIMEOUT_MS,
      inactivityTimeoutMs: timing.inactivityTimeoutMs ?? CODEX_TURN_INACTIVITY_TIMEOUT_MS,
    };
  }
  async start(): Promise<void> {
    if (this.child && !this.child.killed) return;
    this.status = "STARTING";
    this.child = spawn(this.command, this.commandArgs, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.child.once("exit", () => { this.child = null; this.status = "UNAVAILABLE"; this.initialized = false; this.threads.clear(); for (const pending of Array.from(this.pending.values())) pending.reject(new Error("CODEX_RUNTIME_EXITED")); this.pending.clear(); });
    readline.createInterface({ input: this.child.stdout }).on("line", (line) => this.handleLine(line));
    this.child.stderr.on("data", () => undefined);
    await this.request("initialize", { clientInfo: { name: "goodtrading", version: "dev" }, capabilities: { experimentalApi: true } });
    this.initialized = true;
    const account = await this.request("account/read", {}) as { account?: unknown; requiresOpenaiAuth?: boolean };
    this.account = account.account ?? null;
    if (account.requiresOpenaiAuth && !account.account) { this.status = "AUTH_REQUIRED"; return; }
    try { const models = await this.request("model/list", {}) as { data?: Array<{ id?: string }> }; this.models = (models.data ?? []).map((item) => item.id).filter((id): id is string => Boolean(id)); } catch { this.models = []; }
    this.status = "READY";
  }
  private handleLine(line: string) { try { const message = JSON.parse(line) as RpcMessage; if (typeof message.id === "number") { const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); if (message.error) pending.reject(new Error(message.error.message ?? "CODEX_RPC_ERROR")); else pending.resolve(message.result); return; } for (const listener of Array.from(this.listeners)) listener(message); } catch { /* protocol errors are surfaced by timeout/exit */ } }
  private request(method: string, params: unknown, timeoutMs = this.timing.controlRpcTimeoutMs): Promise<unknown> { if (!this.child || (!this.initialized && method !== "initialize")) return Promise.reject(new Error("CODEX_RUNTIME_NOT_STARTED")); const id = this.nextId++; return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("CODEX_RPC_TIMEOUT")); }, timeoutMs); this.pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } }); this.child?.stdin.write(`${JSON.stringify({ id, method, params })}\n`); }); }
  private async threadFor(conversationKey: string, model: string, quality?: string): Promise<string> { const existing = this.threads.get(conversationKey); if (existing) return existing; const result = await this.request("thread/start", { model, approvalPolicy: "never", sandboxPolicy: { type: "readOnly" }, cwd: process.cwd(), reasoningEffort: effortFor(quality) }) as { thread?: { id?: string } }; const id = result.thread?.id; if (!id) throw new Error("CODEX_THREAD_START_FAILED"); this.threads.set(conversationKey, id); return id; }
  async turn(conversationKey: string, prompt: string, model: string, quality?: string): Promise<string> { await this.start(); if (this.status !== "READY") throw new Error("CODEX_AUTH_REQUIRED"); const threadId = await this.threadFor(conversationKey, model, quality); return new Promise((resolve, reject) => { let text = ""; let completed = false; let turnStartAcked = false; let deadlineTimer: NodeJS.Timeout | undefined; let inactivityTimer: NodeJS.Timeout | undefined; const startedAt = Date.now(); const trace = (event: string, extra: Record<string, unknown> = {}) => console.info("[CodexTrace]", JSON.stringify({ event, provider: "openai-codex", model, quality: quality ?? "MEDIUM", conversationKey, threadId, elapsedMs: Date.now() - startedAt, ...extra })); const cleanup = () => { this.listeners.delete(onMessage); if (deadlineTimer) clearTimeout(deadlineTimer); if (inactivityTimer) clearTimeout(inactivityTimer); }; const fail = (error: Error) => { if (completed) return; completed = true; cleanup(); reject(error); }; const armInactivity = (reason: string) => { if (!turnStartAcked) return; if (inactivityTimer) clearTimeout(inactivityTimer); trace("INACTIVITY_RESET", { reason }); inactivityTimer = setTimeout(() => { trace("INACTIVITY_TIMEOUT_TRIGGERED"); fail(new Error("CODEX_TURN_INACTIVITY_TIMEOUT")); }, this.timing.inactivityTimeoutMs); }; const onMessage = (message: RpcMessage) => { const params = message.params as { threadId?: string; turn?: { status?: string; error?: { message?: string }; items?: Array<{ type?: string; text?: string }> }; delta?: string } | undefined; if (!params || params.threadId !== threadId) return; if (turnStartAcked && message.method) { trace("PROGRESS_EVENT", { method: message.method }); armInactivity(message.method); } if (message.method === "turn/started") trace("TURN_STARTED"); if (message.method === "item/agentMessage/delta") { text += params.delta ?? ""; trace("TEXT_DELTA", { deltaBytes: Buffer.byteLength(params.delta ?? "") }); } if (message.method === "turn/completed") { completed = true; cleanup(); trace("TURN_COMPLETED", { textBytes: Buffer.byteLength(text) }); if (params.turn?.error) reject(new Error(params.turn.error.message ?? "CODEX_TURN_FAILED")); else if (!text && params.turn?.items) text = params.turn.items.filter((item) => item.type === "agentMessage").map((item) => item.text ?? "").join(""); resolve(text); } }; this.listeners.add(onMessage); trace("TURN_STARTED_REQUEST"); deadlineTimer = setTimeout(() => fail(new Error("CODEX_TURN_TIMEOUT")), this.timing.turnTimeoutMs); this.request("turn/start", { threadId, input: [{ type: "text", text: prompt }], model, effort: effortFor(quality), approvalPolicy: "never", sandboxPolicy: { type: "readOnly" } }, this.timing.turnTimeoutMs).then(() => { if (completed) return; turnStartAcked = true; trace("TURN_START_ACK"); armInactivity("turn/start_ack"); }).catch((error) => fail(error instanceof Error ? error : new Error(String(error)))); }); }
  async connect(): Promise<CodexConnectResult> {
    await this.start();
    const snapshot = this.snapshot();
    if (snapshot.status === "READY" && snapshot.account?.connected) {
      return { status: "CONNECTED", provider: "openai-codex", accountConnected: true, models: snapshot.models };
    }
    const response = await this.request("account/login/start", { root: { type: "chatgpt" } });
    return normalizeLoginResponse(response, snapshot.models);
  }
  async loginBrowser() { return this.connect(); }
  async logout() { if (!this.child) return; await this.request("account/logout", {}); this.status = "AUTH_REQUIRED"; }
  async stop() { if (!this.child) return; this.child.stdin.end(); this.child.kill(); this.child = null; this.initialized = false; this.threads.clear(); this.status = "DISCONNECTED"; }
  snapshot() { return { status: this.status, account: this.account ? { connected: true } : null, models: this.models } as const; }
}
