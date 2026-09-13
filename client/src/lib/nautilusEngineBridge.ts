import { isTauriRuntime } from "@/lib/desktopRuntime";

export const EXPECTED_NAUTILUS_VERSION = "1.231.0";

export type NautilusEngineStateWire =
  | "STOPPED"
  | "STARTING"
  | "HEALTHY"
  | "UNHEALTHY"
  | "STOPPING"
  | "FAILED";

export type NautilusEngineStatusWire = {
  state: NautilusEngineStateWire;
  pid?: number;
  service?: string;
  protocolVersion?: number;
  nautilusVersion?: string;
  pythonVersion?: string;
  lastError?: string;
};

export type NautilusEngineVersionWire = {
  protocolVersion: number;
  nautilusVersion: string;
  pythonVersion: string;
  pid: number;
};

export type NautilusEnginePingWire = {
  pong: boolean;
};

export type NautilusEngineCommandErrorCategory = "DAEMON" | "TRANSPORT" | "PROTOCOL" | "ENGINE";

export class NautilusEngineCommandError extends Error {
  readonly category: NautilusEngineCommandErrorCategory;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    category: NautilusEngineCommandErrorCategory,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "NautilusEngineCommandError";
    this.category = category;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  override toJSON(): NautilusEngineCommandError {
    return this;
  }
}

type InvokeLikeError = {
  category?: unknown;
  code?: unknown;
  message?: unknown;
  details?: unknown;
};

const COMMANDS = {
  start: "nautilus_engine_start",
  status: "nautilus_engine_status",
  ping: "nautilus_engine_ping",
  version: "nautilus_engine_version",
  stop: "nautilus_engine_stop",
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function nativeUnavailableError(details?: unknown): NautilusEngineCommandError {
  return new NautilusEngineCommandError(
    "TRANSPORT",
    "native_unavailable",
    "Tauri native runtime is unavailable",
    details,
  );
}

function malformedNativeRejectionError(details?: unknown): NautilusEngineCommandError {
  return new NautilusEngineCommandError(
    "PROTOCOL",
    "malformed_native_rejection",
    "Malformed native rejection",
    details,
  );
}

function normalizeNautilusEngineCommandError(error: unknown): NautilusEngineCommandError {
  if (error instanceof NautilusEngineCommandError) return error;
  if (isRecord(error)) {
    const { category, code, message, details } = error as InvokeLikeError;
    if (isString(category) && isString(code) && isString(message)) {
      return new NautilusEngineCommandError(
        category as NautilusEngineCommandErrorCategory,
        code,
        message,
        details,
      );
    }
    if (isString(message) && message.trim()) {
      return new NautilusEngineCommandError(
        "TRANSPORT",
        "invoke_failed",
        message,
        details,
      );
    }
  }
  if (error instanceof Error) {
    return new NautilusEngineCommandError(
      "TRANSPORT",
      "invoke_failed",
      error.message || "Native invoke failed",
      { name: error.name },
    );
  }
  return malformedNativeRejectionError(error);
}

async function defaultInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export type NautilusEngineBridgeDependencies = {
  isTauriRuntime?: () => boolean;
  invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
};

export type NautilusEngineBridge = {
  status: () => Promise<NautilusEngineStatusWire>;
  start: () => Promise<NautilusEngineStatusWire>;
  ping: () => Promise<NautilusEnginePingWire>;
  version: () => Promise<NautilusEngineVersionWire>;
  stop: () => Promise<NautilusEngineStatusWire>;
};

export function createNautilusEngineBridge(
  deps: NautilusEngineBridgeDependencies = {},
): NautilusEngineBridge {
  const runtimeIsTauri = deps.isTauriRuntime ?? isTauriRuntime;
  const invoke = deps.invoke ?? defaultInvoke;

  async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (!runtimeIsTauri()) {
      throw nativeUnavailableError({ command });
    }
    try {
      return await invoke<T>(command, args);
    } catch (error) {
      throw normalizeNautilusEngineCommandError(error);
    }
  }

  return {
    async status(): Promise<NautilusEngineStatusWire> {
      return invokeCommand<NautilusEngineStatusWire>(COMMANDS.status);
    },
    async start(): Promise<NautilusEngineStatusWire> {
      return invokeCommand<NautilusEngineStatusWire>(COMMANDS.start);
    },
    async ping(): Promise<NautilusEnginePingWire> {
      return invokeCommand<NautilusEnginePingWire>(COMMANDS.ping);
    },
    async version(): Promise<NautilusEngineVersionWire> {
      return invokeCommand<NautilusEngineVersionWire>(COMMANDS.version);
    },
    async stop(): Promise<NautilusEngineStatusWire> {
      return invokeCommand<NautilusEngineStatusWire>(COMMANDS.stop);
    },
  };
}

export const nautilusEngine = createNautilusEngineBridge();
