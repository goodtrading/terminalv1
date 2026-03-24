import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { subscriptionPlans, subscriptions, type SubscriptionPlan } from "@shared/schema";

/** DB / CHECK-friendly literals (lowercase only). */
export const SUBSCRIPTION_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  INACTIVE: "inactive",
} as const;

function requireDb() {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
}

function computeDefaultEndsAt(startsAt: Date, plan: SubscriptionPlan, extraDays?: number): Date {
  const end = new Date(startsAt);
  const days = extraDays ?? plan.durationDays;
  if (days > 0) {
    end.setDate(end.getDate() + days);
    return end;
  }
  end.setMonth(end.getMonth() + 1);
  return end;
}

export async function ensureDefaultPlans(): Promise<void> {
  requireDb();
  const count = await db!.select({ count: sql<number>`count(*)::int` }).from(subscriptionPlans);
  const n = Number(count[0]?.count ?? 0);
  if (n > 0) return;

  await db!.insert(subscriptionPlans).values([
    {
      slug: "monthly",
      name: "Monthly",
      priceUsd: 49,
      durationDays: 30,
      paypalLink:
        process.env.SAAS_PAYPAL_MONTHLY_URL ||
        "https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&your_link_here",
      usdtAddress: process.env.SAAS_USDT_ADDRESS || "",
      sortOrder: 0,
    },
    {
      slug: "quarterly",
      name: "Quarterly",
      priceUsd: 129,
      durationDays: 90,
      paypalLink:
        process.env.SAAS_PAYPAL_QUARTERLY_URL ||
        process.env.SAAS_PAYPAL_MONTHLY_URL ||
        "https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&your_link_here",
      usdtAddress: process.env.SAAS_USDT_ADDRESS || "",
      sortOrder: 1,
    },
  ]);
  console.log("[SaaS] Seeded default subscription plans");
}

export async function listPlans(): Promise<SubscriptionPlan[]> {
  requireDb();
  return db!.select().from(subscriptionPlans).orderBy(subscriptionPlans.sortOrder);
}

export async function getPlanById(id: number): Promise<SubscriptionPlan | undefined> {
  requireDb();
  const rows = await db!.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  return rows[0];
}

export async function getPlanBySlug(slug: string): Promise<SubscriptionPlan | undefined> {
  requireDb();
  const rows = await db!.select().from(subscriptionPlans).where(eq(subscriptionPlans.slug, slug));
  return rows[0];
}

export async function getLatestActiveSubscriptionForUser(userId: number) {
  requireDb();
  const now = new Date();
  const rows = await db!
    .select({
      subscription: subscriptions,
      plan: subscriptionPlans,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE),
        gt(subscriptions.endsAt, now),
      ),
    )
    .orderBy(desc(subscriptions.endsAt))
    .limit(1);
  return rows[0];
}

export async function getLatestSubscriptionForUser(userId: number) {
  requireDb();
  const rows = await db!
    .select({
      subscription: subscriptions,
      plan: subscriptionPlans,
    })
    .from(subscriptions)
    .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.endsAt))
    .limit(1);
  return rows[0];
}

export async function markSubscriptionExpiredById(subscriptionId: number): Promise<boolean> {
  requireDb();
  const rows = await db!
    .update(subscriptions)
    .set({ status: SUBSCRIPTION_STATUS.EXPIRED })
    .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE)))
    .returning({ id: subscriptions.id });
  return rows.length > 0;
}

export async function createSubscriptionForUser(
  userId: number,
  planId: number,
  startsAt = new Date(),
): Promise<void> {
  requireDb();
  const plan = await getPlanById(planId);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const endsAt = computeDefaultEndsAt(startsAt, plan);

  await db!.insert(subscriptions).values({
    userId,
    planId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    startsAt,
    endsAt,
  });
}

export async function expireSubscriptionsPastDue(): Promise<number> {
  const now = new Date();
  requireDb();
  const rows = await db!
    .update(subscriptions)
    .set({ status: SUBSCRIPTION_STATUS.EXPIRED })
    .where(
      and(eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE), lte(subscriptions.endsAt, now)),
    )
    .returning({ id: subscriptions.id });
  return rows.length;
}

export type GrantSubscriptionOpts = {
  extraDays?: number;
  /** If omitted, uses `new Date()` */
  startsAt?: Date;
  /** If omitted, computed from plan duration (or +1 month fallback) */
  endsAt?: Date;
};

/**
 * Marks current active rows expired, then inserts one active row into `saas_subscriptions`
 * (columns: user_id, plan_id, status, starts_at, ends_at).
 */
export async function grantSubscriptionForUser(
  userId: number,
  planId: number,
  opts?: GrantSubscriptionOpts,
): Promise<void> {
  requireDb();
  const plan = await getPlanById(planId);
  if (!plan) throw new Error("PLAN_NOT_FOUND");

  const now = new Date();
  const startsAt =
    opts?.startsAt && !Number.isNaN(opts.startsAt.getTime()) ? new Date(opts.startsAt) : new Date();

  let endsAt: Date;
  if (opts?.endsAt && !Number.isNaN(opts.endsAt.getTime())) {
    endsAt = new Date(opts.endsAt);
  } else {
    const existing = await getLatestActiveSubscriptionForUser(userId);
    const addDays = opts?.extraDays ?? plan.durationDays;
    if (existing && existing.subscription.endsAt > now) {
      endsAt = new Date(existing.subscription.endsAt);
      const bump = addDays > 0 ? addDays : 30;
      endsAt.setDate(endsAt.getDate() + bump);
    } else {
      endsAt = computeDefaultEndsAt(startsAt, plan, opts?.extraDays);
    }
  }

  await db!
    .update(subscriptions)
    .set({ status: SUBSCRIPTION_STATUS.EXPIRED })
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE)),
    );

  await db!.insert(subscriptions).values({
    userId,
    planId,
    status: SUBSCRIPTION_STATUS.ACTIVE,
    startsAt,
    endsAt,
  });
}

export async function deactivateSubscriptionForUser(userId: number): Promise<number> {
  requireDb();
  const rows = await db!
    .update(subscriptions)
    .set({ status: SUBSCRIPTION_STATUS.INACTIVE })
    .where(
      and(eq(subscriptions.userId, userId), eq(subscriptions.status, SUBSCRIPTION_STATUS.ACTIVE)),
    )
    .returning({ id: subscriptions.id });
  return rows.length;
}
