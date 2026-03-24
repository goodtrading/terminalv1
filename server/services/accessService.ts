import {
  getLatestActiveSubscriptionForUser,
  getLatestSubscriptionForUser,
  markSubscriptionExpiredById,
} from "./subscriptionService";
import { findUserById } from "./userService";
import { isAdminRole } from "../lib/userRoles";

export interface AccessSnapshot {
  allowed: boolean;
  reason?:
    | "no_subscription"
    | "expired"
    | "inactive"
    | "admin"
    | "unknown"
    | "pending_approval"
    | "approved_to_pay"
    | "pending_payment_review";
  subscription?: {
    id: number;
    planId: number;
    planName: string;
    planSlug: string;
    endsAt: string;
    startsAt: string;
  };
}

export async function getAccessForUserId(userId: number): Promise<AccessSnapshot> {
  const user = await findUserById(userId);
  if (!user) return { allowed: false, reason: "unknown" };
  if (user.status === "inactive" || user.status === "rejected") {
    return { allowed: false, reason: "inactive" };
  }
  if (isAdminRole(user.role)) {
    return { allowed: true, reason: "admin" };
  }
  if (user.status === "pending") {
    return { allowed: false, reason: "pending_approval" };
  }
  if (user.status === "approved_to_pay") {
    return { allowed: false, reason: "approved_to_pay" };
  }
  if (user.status === "pending_payment_review") {
    return { allowed: false, reason: "pending_payment_review" };
  }
  if (user.status !== "active") {
    return { allowed: false, reason: "unknown" };
  }

  // Lazy expiration: if latest is still marked active but date already passed, expire it now.
  const latest = await getLatestSubscriptionForUser(userId);
  if (latest && latest.subscription.status === "active" && latest.subscription.endsAt <= new Date()) {
    await markSubscriptionExpiredById(latest.subscription.id);
    return { allowed: false, reason: "expired" };
  }

  const row = await getLatestActiveSubscriptionForUser(userId);
  if (!row) {
    if (latest && (latest.subscription.status === "expired" || latest.subscription.endsAt <= new Date())) {
      return { allowed: false, reason: "expired" };
    }
    return { allowed: false, reason: "no_subscription" };
  }
  const ends = row.subscription.endsAt;
  if (ends <= new Date()) {
    return { allowed: false, reason: "expired" };
  }
  return {
    allowed: true,
    subscription: {
      id: row.subscription.id,
      planId: row.plan.id,
      planName: row.plan.name,
      planSlug: row.plan.slug,
      endsAt: row.subscription.endsAt.toISOString(),
      startsAt: row.subscription.startsAt.toISOString(),
    },
  };
}
