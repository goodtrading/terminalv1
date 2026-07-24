import {
  getBingxAccountPollIntervalMs,
  isBingxAccountAutoRefreshEnabled,
  isBingxAccountEnabled,
} from "./flags";
import { refreshBingxAccountSnapshot } from "./service";
import { logBingxAccount } from "./observability";

type PollTarget = {
  userId: number;
  connectionId: string;
  symbol?: string;
};

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
const targets = new Map<string, PollTarget>();

function targetKey(t: PollTarget): string {
  return `${t.userId}:${t.connectionId}`;
}

/** Register a user/connection for controlled polling (single publisher). */
export function registerBingxAccountPollTarget(t: PollTarget): void {
  if (!isBingxAccountEnabled() || !isBingxAccountAutoRefreshEnabled()) {
    return;
  }
  targets.set(targetKey(t), t);
  ensurePoller();
}

export function unregisterBingxAccountPollTarget(
  userId: number,
  connectionId: string,
): void {
  targets.delete(`${userId}:${connectionId}`);
  if (targets.size === 0) stopBingxAccountPoller();
}

function ensurePoller(): void {
  if (timer || !isBingxAccountAutoRefreshEnabled()) return;
  const interval = getBingxAccountPollIntervalMs();
  timer = setInterval(() => {
    void tick();
  }, interval);
  // unref so poller does not block process exit /health
  if (typeof timer === "object" && timer && "unref" in timer) {
    (timer as NodeJS.Timeout).unref?.();
  }
  logBingxAccount("poller_started", { intervalMs: interval });
}

export function stopBingxAccountPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function tick(): Promise<void> {
  if (inFlight) return;
  if (!isBingxAccountEnabled() || !isBingxAccountAutoRefreshEnabled()) {
    stopBingxAccountPoller();
    return;
  }
  if (targets.size === 0) return;
  inFlight = true;
  try {
    for (const t of Array.from(targets.values())) {
      try {
        await refreshBingxAccountSnapshot(t);
      } catch (err) {
        logBingxAccount("poll_refresh_failed", {
          code: err instanceof Error ? err.message.slice(0, 80) : "error",
        });
      }
    }
  } finally {
    inFlight = false;
  }
}

/** Manual refresh path — does not require auto-refresh flag. */
export async function manualBingxAccountRefresh(t: PollTarget) {
  return refreshBingxAccountSnapshot(t);
}
