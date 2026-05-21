import { AsyncLocalStorage } from "async_hooks";

const paperUserStorage = new AsyncLocalStorage<{ userId: number }>();

/** Run paper engine/store logic scoped to one authenticated user. */
export function runWithPaperUser<T>(userId: number, fn: () => T): T {
  return paperUserStorage.run({ userId }, fn);
}

export async function runWithPaperUserAsync<T>(
  userId: number,
  fn: () => Promise<T>,
): Promise<T> {
  return paperUserStorage.run({ userId }, fn);
}

export function getCurrentPaperUserId(): number {
  return paperUserStorage.getStore()?.userId ?? 0;
}
