import {
  getAccessForUserId as defaultGetAccessForUserId,
  type AccessSnapshot,
} from "../../accessService";

export type BingxAccessDenyCode =
  | "AUTH_REQUIRED"
  | "PLAN_REQUIRED"
  | "PLAN_EXPIRED"
  | "BINGX_ACCESS_NOT_INCLUDED"
  | "PLAN_VALIDATION_UNAVAILABLE"
  | "ACCOUNT_INACTIVE";

export type BingxAccessResult =
  | {
      ok: true;
      userId: number;
      planSlug?: string;
      planName?: string;
    }
  | {
      ok: false;
      status: 401 | 403 | 503;
      code: BingxAccessDenyCode;
      message: string;
    };

function excludedPlanSlugs(): Set<string> {
  const raw = process.env.BINGX_EXCLUDED_PLAN_SLUGS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function mapAccessReason(
  reason: string | undefined,
): { code: BingxAccessDenyCode; message: string } {
  switch (reason) {
    case "expired":
      return {
        code: "PLAN_EXPIRED",
        message: "Your subscription has expired. Renew to access BingX monitoring.",
      };
    case "no_subscription":
      return {
        code: "PLAN_REQUIRED",
        message: "An active subscription is required to access BingX monitoring.",
      };
    case "inactive":
    case "pending_approval":
    case "approved_to_pay":
    case "pending_payment_review":
      return {
        code: "ACCOUNT_INACTIVE",
        message: "Your account is not active for terminal access.",
      };
    case "admin":
      return { code: "PLAN_REQUIRED", message: "" };
    default:
      return {
        code: "PLAN_REQUIRED",
        message: "Terminal access is not available for this account.",
      };
  }
}

type AccessResolver = (userId: number) => Promise<AccessSnapshot>;
let accessResolver: AccessResolver = defaultGetAccessForUserId;

/** Test seam — override subscription lookup without hitting the database. */
export function __setBingxAccessResolverForTests(
  resolver: AccessResolver | null,
): void {
  accessResolver = resolver ?? defaultGetAccessForUserId;
}

/** Fail-closed BingX terminal entitlement check (reuses SaaS subscription source). */
export async function verifyBingxTerminalAccess(
  userId: number | null | undefined,
): Promise<BingxAccessResult> {
  if (userId == null || !Number.isFinite(userId) || userId <= 0) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication required for BingX terminal access.",
    };
  }

  try {
    const access = await accessResolver(Math.floor(userId));
    if (access.allowed) {
      const slug = access.subscription?.planSlug?.toLowerCase();
      if (slug && excludedPlanSlugs().has(slug)) {
        return {
          ok: false,
          status: 403,
          code: "BINGX_ACCESS_NOT_INCLUDED",
          message: "Your plan does not include BingX monitoring.",
        };
      }
      return {
        ok: true,
        userId: Math.floor(userId),
        planSlug: access.subscription?.planSlug,
        planName: access.subscription?.planName,
      };
    }

    const mapped = mapAccessReason(access.reason);
    if (mapped.message === "" && access.reason === "admin") {
      return {
        ok: true,
        userId: Math.floor(userId),
      };
    }

    return {
      ok: false,
      status: 403,
      code: mapped.code,
      message: mapped.message,
    };
  } catch {
    return {
      ok: false,
      status: 503,
      code: "PLAN_VALIDATION_UNAVAILABLE",
      message: "Could not verify subscription. BingX access denied.",
    };
  }
}
