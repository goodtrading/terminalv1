export type PaperOwnerSnapshot = Readonly<{
  userId: number;
  generation: number;
}>;

let currentOwner: PaperOwnerSnapshot | null = null;
let generation = 0;
let ownershipEnforced = false;

export function enablePaperOwnershipEnforcement(): void {
  ownershipEnforced = true;
}

export function isPaperOwnershipEnforced(): boolean {
  return ownershipEnforced;
}

function validUserId(userId: number | null | undefined): userId is number {
  return userId != null && Number.isSafeInteger(userId) && userId > 0;
}

export function getPaperOwner(): PaperOwnerSnapshot | null {
  return currentOwner;
}

export function bindPaperOwner(userId: number): PaperOwnerSnapshot {
  if (!validUserId(userId)) throw new Error("PAPER_OWNER_USER_ID_INVALID");
  if (currentOwner?.userId === userId) return currentOwner;
  generation += 1;
  currentOwner = { userId, generation };
  return currentOwner;
}

export function invalidatePaperOwner(): number {
  generation += 1;
  currentOwner = null;
  return generation;
}

export function capturePaperOwner(): PaperOwnerSnapshot {
  if (!currentOwner) {
    if (!ownershipEnforced) return { userId: 0, generation: 0 };
    throw new Error("PAPER_OWNER_NOT_BOUND");
  }
  return currentOwner;
}

export function assertPaperOwnerCurrent(snapshot: PaperOwnerSnapshot): void {
  if (!ownershipEnforced) return;
  if (
    currentOwner == null ||
    currentOwner.userId !== snapshot.userId ||
    currentOwner.generation !== snapshot.generation
  ) {
    throw new Error("PAPER_OWNER_GENERATION_STALE");
  }
}

export function resetPaperOwnerForTests(): void {
  generation = 0;
  currentOwner = null;
  ownershipEnforced = false;
}
