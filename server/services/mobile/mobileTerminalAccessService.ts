import {
  getAccessForUserId as defaultGetAccessForUserId,
  type AccessSnapshot,
} from "../accessService";

export type MobileTerminalDenyCode =
  | "AUTH_REQUIRED"
  | "PLAN_REQUIRED"
  | "PLAN_EXPIRED"
  | "ACCOUNT_INACTIVE"
  | "TERMINAL_ACCESS_DENIED"
  | "PLAN_VALIDATION_UNAVAILABLE";

export type MobileTerminalAccessResult =
  | {
      ok: true;
      userId: number;
      planSlug?: string;
      planName?: string;
      capabilities: {
        terminal_mobile_access: boolean;
      };
    }
  | {
      ok: false;
      status: 401 | 403 | 503;
      code: MobileTerminalDenyCode;
      message: string;
    };

type AccessResolver = (userId: number) => Promise<AccessSnapshot>;
let accessResolver: AccessResolver = defaultGetAccessForUserId;

/** Test seam — override subscription lookup without hitting the database. */
export function __setMobileTerminalAccessResolverForTests(
  resolver: AccessResolver | null,
): void {
  accessResolver = resolver ?? defaultGetAccessForUserId;
}

function mapAccessReason(
  reason: string | undefined,
): { code: MobileTerminalDenyCode; message: string } {
  switch (reason) {
    case "expired":
      return {
        code: "PLAN_EXPIRED",
        message: "Your subscription has expired. Renew to access the terminal.",
      };
    case "no_subscription":
      return {
        code: "PLAN_REQUIRED",
        message: "An active subscription is required for terminal access.",
      };
    case "inactive":
    case "pending_approval":
    case "approved_to_pay":
    case "pending_payment_review":
      return {
        code: "ACCOUNT_INACTIVE",
        message: "Your account is not active for terminal access.",
      };
    default:
      return {
        code: "TERMINAL_ACCESS_DENIED",
        message: "Terminal access is not available for this account.",
      };
  }
}

/**
 * Fail-closed terminal entitlement check for mobile market-state v2.
 * Reuses the same SaaS subscription source as the web terminal.
 *
 * Access model: `terminal_subscription_inherited`
 * - `terminal_mobile_access` is granted when the user has active terminal SaaS access.
 * - There is no separate DB entitlement row for mobile in this phase.
 */
export async function verifyMobileTerminalAccess(
  userId: number | null | undefined,
): Promise<MobileTerminalAccessResult> {
  if (userId == null || !Number.isFinite(userId) || userId <= 0) {
    return {
      ok: false,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Authentication required for mobile terminal access.",
    };
  }

  try {
    const access = await accessResolver(Math.floor(userId));
    if (access.allowed) {
      return {
        ok: true,
        userId: Math.floor(userId),
        planSlug: access.subscription?.planSlug,
        planName: access.subscription?.planName,
        capabilities: {
          terminal_mobile_access: true,
        },
      };
    }

    if (access.reason === "admin") {
      return {
        ok: true,
        userId: Math.floor(userId),
        capabilities: {
          terminal_mobile_access: true,
        },
      };
    }

    const mapped = mapAccessReason(access.reason);
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
      message: "Could not verify subscription. Mobile access denied.",
    };
  }
}
