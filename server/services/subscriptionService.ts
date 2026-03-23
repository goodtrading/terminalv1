import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { subscriptionPlans, subscriptions, type SubscriptionPlan } from "@shared/schema";

function requireDb() {
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
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
        eq(subscriptions.status, "active"),
        gt(subscriptions.endsAt, now),
      ),
    )
    .orderBy(desc(subscriptions.endsAt))
    .limit(1);
  return rows[0];
}

export async function createSubscriptionForUser(
  userId: number,
  planId: number,
  startsAt = new Date(),
): Promise<void> {
  const plan = await getPlanById(planId);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + plan.durationDays);

  await db!.insert(subscriptions).values({
    userId,
    planId,
    status: "active",
    startsAt,
    endsAt,
  });
}

export async function expireSubscriptionsPastDue(): Promise<number> {
  const now = new Date();
  requireDb();
  const rows = await db!
    .update(subscriptions)
    .set({ status: "expired" })
    .where(and(eq(subscriptions.status, "active"), lte(subscriptions.endsAt, now)))
    .returning({ id: subscriptions.id });
  return rows.length;
}

export async function grantSubscriptionForUser(
  userId: number,
  planId: number,
  extraDays?: number,
): Promise<void> {
  const plan = await getPlanById(planId);
  if (!plan) throw new Error("PLAN_NOT_FOUND");
  const existing = await getLatestActiveSubscriptionForUser(userId);
  const startsAt = new Date();
  const now = new Date();
  let endsAt: Date;
  if (existing && existing.subscription.endsAt > now) {
    endsAt = new Date(existing.subscription.endsAt);
    endsAt.setDate(endsAt.getDate() + (extraDays ?? plan.durationDays));
  } else {
    endsAt = new Date(startsAt);
    endsAt.setDate(endsAt.getDate() + (extraDays ?? plan.durationDays));
  }
  await db!
    .update(subscriptions)
    .set({ status: "expired" })
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
  await db!.insert(subscriptions).values({
    userId,
    planId,
    status: "active",
    startsAt,
    endsAt,
  });
}
