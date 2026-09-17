import WebSocket from "ws";
import { BINGX_BOOK_TICKER_SUBSCRIPTION, BINGX_SWAP_MARKET_WS_URL, decodeBingXPublicMessage, parseBingXBookTickerMessage, type BingXBookTickerBboEvent } from "./bingxBookTicker";

export type BingXBookTickerConnectionState = "DISCONNECTED" | "CONNECTING" | "READY" | "DEGRADED";
type SocketLike = { readyState: number; send(data: string): void; close(): void; terminate?(): void; on(event: string, listener: (...args: any[]) => void): void; removeAllListeners?(): void };
export type BingXBookTickerAdapterOptions = Readonly<{
  WebSocket?: new (url: string) => SocketLike;
  now?: () => Date;
  reconnectDelaysMs?: readonly number[];
  onEvent?: (event: BingXBookTickerBboEvent) => void;
  onStateChange?: (state: BingXBookTickerConnectionState) => void;
}>;

export class BingXPublicBookTickerAdapter {
  private readonly WebSocketCtor: new (url: string) => SocketLike;
  private readonly now: () => Date;
  private readonly delays: readonly number[];
  private readonly onEvent?: (event: BingXBookTickerBboEvent) => void;
  private readonly onStateChange?: (state: BingXBookTickerConnectionState) => void;
  private socket: SocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private attempt = 0;
  private _state: BingXBookTickerConnectionState = "DISCONNECTED";
  private _lastError: string | null = null;
  private _subscriptionAcknowledged = false;

  constructor(options: BingXBookTickerAdapterOptions = {}) {
    this.WebSocketCtor = options.WebSocket ?? WebSocket;
    this.now = options.now ?? (() => new Date());
    this.delays = options.reconnectDelaysMs ?? [250, 500, 1000, 2000, 5000];
    this.onEvent = options.onEvent;
    this.onStateChange = options.onStateChange;
  }
  get state(): BingXBookTickerConnectionState { return this._state; }
  get lastError(): string | null { return this._lastError; }
  get subscriptionAcknowledged(): boolean { return this._subscriptionAcknowledged; }
  start(): void { if (!this.stopped) return; this.stopped = false; this.attempt = 0; this.connect(); }
  stop(): void { this.stopped = true; if (this.reconnectTimer) clearTimeout(this.reconnectTimer); this.reconnectTimer = null; const socket = this.socket; this.socket = null; if (socket) { socket.removeAllListeners?.(); socket.close(); } this.setState("DISCONNECTED"); }
  private setState(state: BingXBookTickerConnectionState): void { this._state = state; this.onStateChange?.(state); }
  private connect(): void {
    if (this.stopped) return; this.setState("CONNECTING"); this._subscriptionAcknowledged = false;
    try { this.socket = new this.WebSocketCtor(BINGX_SWAP_MARKET_WS_URL); } catch (e) { this.fail(e); return; }
    const socket = this.socket;
    socket.on("open", () => { if (this.stopped) return; this.attempt = 0; socket.send(JSON.stringify({ id: `gt-bookTicker-${Date.now()}`, reqType: "sub", dataType: BINGX_BOOK_TICKER_SUBSCRIPTION })); });
    socket.on("message", (data: string | Uint8Array) => this.handleMessage(data));
    socket.on("error", (e: Error) => { this._lastError = e.message; this.setState("DEGRADED"); });
    socket.on("close", () => { if (this.socket !== socket) return; this.socket = null; this._subscriptionAcknowledged = false; if (!this.stopped) this.scheduleReconnect(); else this.setState("DISCONNECTED"); });
  }
  private handleMessage(raw: string | Uint8Array): void {
    let text: string; try { text = decodeBingXPublicMessage(raw); } catch (e) { this._lastError = e instanceof Error ? e.message : String(e); this.setState("DEGRADED"); return; }
    if (text === "ping" || text.includes('"ping"')) { this.socket?.send("pong"); return; }
    let parsed: unknown; try { parsed = JSON.parse(text); } catch { return; }
    const record = parsed as Record<string, unknown>;
    if (record.code === 0 && record.data == null && (record.reqType === "sub" || record.dataType === "" || record.msg === "SUCCESS")) { this._subscriptionAcknowledged = true; this.setState("READY"); return; }
    const result = parseBingXBookTickerMessage(text, this.now());
    if (result.ok) { this.onEvent?.(result.event); if (this._state !== "READY") this.setState("READY"); }
  }
  private fail(error: unknown): void { this._lastError = error instanceof Error ? error.message : String(error); this.socket = null; this.scheduleReconnect(); }
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    if (this.attempt >= this.delays.length) { this.setState("DEGRADED"); return; }
    const delay = this.delays[this.attempt++]; this.setState("DEGRADED");
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }
}
