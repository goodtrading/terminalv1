import { eq } from "drizzle-orm";
import { db } from "../db";
import { payments } from "@shared/schema";

function requireDb() {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
}

export async function createPaymentReport(params: {
  userId: number;
  amountUsd: number;
  method: string;
  externalRef?: string | null;
  notes?: string | null;
}) {
  requireDb();
  const rows = await db!
    .insert(payments)
    .values({
      userId: params.userId,
      amountUsd: params.amountUsd,
      method: params.method,
      status: "pending",
      externalRef: params.externalRef ?? null,
      notes: params.notes ?? null,
    })
    .returning();
  return rows[0]!;
}

export async function listPaymentsForUser(userId: number) {
  requireDb();
  return db!.select().from(payments).where(eq(payments.userId, userId));
}
