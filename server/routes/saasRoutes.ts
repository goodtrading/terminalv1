import type { Express, Request, Response } from "express";
import { z } from "zod";
import { dbRoleToApiRole, isAdminRole } from "../lib/userRoles";
import { AUTH_COOKIE_NAME, clearAuthCookie, getAuthCookieOptions } from "../lib/authCookie";
import { verifyPassword } from "../lib/password";
import { signUserToken } from "../lib/jwt";
import {
  logAuthMeDiagnostic,
  optionalSaasAuth,
  requireSaasAuth,
  requireSaasAdmin,
  resolveAuthenticatedUser,
} from "../middleware/saasAuth";
import {
  createUser,
  ensureBootstrapAdmin,
  findUserByEmail,
  findUserById,
  listUsersForAdmin,
  onboardingStatusToDbStatus,
  setUserActive,
  setUserOnboardingStatus,
  updateUserAdminPatch,
} from "../services/userService";
import { getAccessForUserId } from "../services/accessService";
import {
  getLatestSubscriptionForUser,
  ensureDefaultPlans,
  deactivateSubscriptionForUser,
  grantSubscriptionForUser,
  listPlans,
} from "../services/subscriptionService";
import { createPaymentReport } from "../services/paymentService";

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
  fullName: z.string().max(200).optional(),
});

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const paymentReportBody = z.object({
  amountUsd: z.number().positive(),
  method: z.enum(["usdt", "paypal", "other"]),
  externalRef: z.string().optional(),
  notes: z.string().optional(),
});

const patchUserBody = z.object({
  role: z.enum(["user", "admin"]).optional(),
  isActive: z.boolean().optional(),
  onboardingStatus: z
    .enum([
      "pending_approval",
      "approved_to_pay",
      "pending_payment_review",
      "active",
      "inactive",
      "rejected",
    ])
    .optional(),
});

const grantSubBody = z.object({
  planId: z.coerce.number().int().positive(),
  extraDays: z.coerce.number().int().positive().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});

/** Admin table: derive onboarding column from DB `users.status` (includes legacy values if still present). */
function statusToOnboardingStatus(status: string): string {
  const m: Record<string, string> = {
    pending: "pending_approval",
    active: "active",
    inactive: "inactive",
    rejected: "inactive",
    approved_to_pay: "approved_to_pay",
    pending_payment_review: "pending_payment_review",
  };
  return m[status] ?? status;
}

function userIsActiveish(u: { status: string }): boolean {
  return ["active", "approved_to_pay", "pending_payment_review"].includes(u.status);
}

export function registerSaasRoutes(app: Express): void {
  void (async () => {
    try {
      await ensureDefaultPlans();
      await ensureBootstrapAdmin();
    } catch (e) {
      console.error("[SaaS] startup seed failed:", e);
    }
  })();

  app.get("/api/plans", async (_req: Request, res: Response) => {
    try {
      const plans = await listPlans();
      res.json({ plans });
    } catch (e: any) {
      console.error("[SaaS] /api/plans", e);
      res.status(500).json({ error: "PLANS_FAILED" });
    }
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const logPrefix = "[auth/register]";
    try {
      const parsed = registerBody.safeParse(req.body);
      if (!parsed.success) {
        console.warn(logPrefix, "validation failed", parsed.error.flatten());
        res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
        return;
      }
      const { email, password, fullName } = parsed.data;
      if (!password || password.length < 8) {
        console.warn(logPrefix, "password too short or empty", { email: email.toLowerCase() });
        res.status(400).json({ error: "PASSWORD_TOO_SHORT", message: "Password must be at least 8 characters" });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      console.info(logPrefix, "attempt", { email: normalizedEmail });

      const existing = await findUserByEmail(normalizedEmail);
      if (existing) {
        console.info(logPrefix, "email already exists", { id: existing.id, email: normalizedEmail });
        res.status(409).json({ error: "EMAIL_TAKEN", message: "An account with this email already exists" });
        return;
      }

      const user = await createUser(normalizedEmail, password, "user", { fullName });
      console.info(logPrefix, "insert ok", { id: user.id, email: user.email, fullName: user.fullName, status: user.status });

      const token = signUserToken({
        id: user.id,
        email: user.email,
        role: dbRoleToApiRole(user.role),
      });
      const access = await getAccessForUserId(user.id);
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      res.status(201).json({
        message: "Account created. Your status is pending until an administrator approves access.",
        status: user.status,
        token,
        user: {
          id: user.id,
          email: user.email,
          role: dbRoleToApiRole(user.role),
          fullName: user.fullName,
        },
        access,
      });
    } catch (e: any) {
      const pg = e && typeof e === "object";
      console.error(logPrefix, "failed", {
        message: e?.message ?? String(e),
        code: pg ? e.code : undefined,
        detail: pg ? e.detail : undefined,
        constraint: pg ? e.constraint : undefined,
        column: pg ? e.column : undefined,
        stack: e?.stack,
      });
      res.status(500).json({ error: "REGISTER_FAILED" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const logPrefix = "[auth/login]";
    console.log(logPrefix, "Request received:", { 
      email: req.body?.email, 
      hasPassword: !!req.body?.password,
      userAgent: req.get('User-Agent')
    });

    try {
      // Test DB connection first
      const { pool } = await import("../db");
      if (!pool) {
        console.error(logPrefix, "Database pool is null");
        return res.status(500).json({ error: "DATABASE_NOT_CONFIGURED" });
      }
      
      const dbTest = await pool.query('SELECT 1');
      console.log(logPrefix, "DB connection test:", dbTest.rows.length > 0 ? "OK" : "FAILED");

      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        console.warn(logPrefix, "Validation failed:", parsed.error.flatten());
        res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
        return;
      }
      
      const { email, password } = parsed.data;
      console.log(logPrefix, "Looking up user:", email);
      
      const user = await findUserByEmail(email);
      if (!user) {
        console.warn(logPrefix, "User not found:", email);
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }
      
      console.log(logPrefix, "User found:", { id: user.id, email: user.email, role: user.role });
      
      const passwordValid = verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        console.warn(logPrefix, "Invalid password for user:", email);
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }
      
      console.log(logPrefix, "Password validated for user:", email);
      
      const token = signUserToken({
        id: user.id,
        email: user.email,
        role: dbRoleToApiRole(user.role),
      });
      
      const access = await getAccessForUserId(user.id);
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      
      console.log(logPrefix, "Login successful:", { 
        userId: user.id, 
        email: user.email, 
        accessAllowed: access.allowed 
      });
      
      res.json({
        token,
        user: { id: user.id, email: user.email, role: dbRoleToApiRole(user.role) },
        access,
      });
    } catch (e: any) {
      console.error(logPrefix, "Login failed:", {
        message: e?.message,
        stack: e?.stack,
        code: e?.code,
        detail: e?.detail
      });
      res.status(500).json({ 
        error: "LOGIN_FAILED",
        message: e?.message || "Internal server error"
      });
    }
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", optionalSaasAuth, async (req: Request, res: Response) => {
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    try {
      const { user, tokenSource, diagnostic } = await resolveAuthenticatedUser(req, {
        enforceMayAuthenticate: false,
      });
      const authenticated = Boolean(user);
      logAuthMeDiagnostic(
        req,
        authenticated,
        user?.id ?? null,
        tokenSource,
        diagnostic,
      );
      if (!user) {
        res.json({ authenticated: false, user: null, access: null });
        return;
      }
      if (req.saasUser?.id !== user.id) {
        req.saasUser = user;
        req.user = user;
      }
      const access = await getAccessForUserId(user.id);
      res.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        access,
      });
    } catch (e: any) {
      console.error("[SaaS] /api/auth/me", e);
      res.status(500).json({ error: "ME_FAILED" });
    }
  });

  app.get("/api/auth/access", requireSaasAuth, async (req: Request, res: Response) => {
    try {
      const access = await getAccessForUserId(req.saasUser!.id);
      res.json(access);
    } catch (e: any) {
      console.error("[SaaS] /api/auth/access", e);
      res.status(500).json({ error: "ACCESS_FAILED" });
    }
  });

  app.post("/api/payments/report", requireSaasAuth, async (req: Request, res: Response) => {
    try {
      const currentAccess = await getAccessForUserId(req.saasUser!.id);
      if (currentAccess.allowed) {
        res.status(400).json({ error: "ALREADY_ACTIVE" });
        return;
      }
      const parsed = paymentReportBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
        return;
      }
      const row = await createPaymentReport({
        userId: req.saasUser!.id,
        amountUsd: parsed.data.amountUsd,
        method: parsed.data.method,
        externalRef: parsed.data.externalRef,
        notes: parsed.data.notes,
      });
      res.json({ payment: row });
    } catch (e: any) {
      console.error("[SaaS] payment report", e);
      res.status(500).json({ error: "PAYMENT_REPORT_FAILED" });
    }
  });

  app.get("/api/admin/users", requireSaasAdmin, async (_req: Request, res: Response) => {
    try {
      const users = await listUsersForAdmin();
      const out = await Promise.all(
        users.map(async (u) => {
          const access = await getAccessForUserId(u.id);
          const latestSub = await getLatestSubscriptionForUser(u.id);
          return {
            id: u.id,
            email: u.email,
            role: dbRoleToApiRole(u.role),
            isActive: userIsActiveish(u),
            onboardingStatus: statusToOnboardingStatus(u.status),
            createdAt: u.createdAt?.toISOString?.() ?? null,
            access,
            latestSubscription: latestSub
              ? {
                  status: latestSub.subscription.status,
                  startsAt: latestSub.subscription.startsAt.toISOString(),
                  endsAt: latestSub.subscription.endsAt.toISOString(),
                  planName: latestSub.plan.name,
                  planId: latestSub.plan.id,
                }
              : null,
          };
        }),
      );
      res.json({ users: out });
    } catch (e: any) {
      console.error("[SaaS] admin users", e);
      res.status(500).json({ error: "ADMIN_LIST_FAILED" });
    }
  });

  app.patch("/api/admin/users/:id", requireSaasAdmin, async (req: Request, res: Response) => {
    console.log("UPDATE USER PAYLOAD:", req.body);
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "BAD_ID" });
        return;
      }
      const parsed = patchUserBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
        return;
      }
      const target = await findUserById(id);
      if (!target) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }

      let dbStatus: ReturnType<typeof onboardingStatusToDbStatus> | undefined;
      if (parsed.data.onboardingStatus != null) {
        dbStatus = onboardingStatusToDbStatus(parsed.data.onboardingStatus);
      } else if (parsed.data.isActive !== undefined) {
        dbStatus = parsed.data.isActive ? "active" : "inactive";
      }

      let dbRole: string | undefined;
      if (parsed.data.role != null) {
        const role = parsed.data.role;
        dbRole = role === "user" ? "member" : role;
      }

      if (dbStatus === undefined && dbRole === undefined) {
        res.json({
          user: {
            ...target,
            role: dbRoleToApiRole(target.role),
          },
        });
        return;
      }

      await updateUserAdminPatch(id, { status: dbStatus, role: dbRole });
      const updated = await findUserById(id);
      res.json({
        user: updated
          ? {
              ...updated,
              role: dbRoleToApiRole(updated.role),
            }
          : undefined,
      });
    } catch (e: unknown) {
      const err = e as { message?: string };
      console.error("[SaaS] admin patch user", e);
      res.status(500).json({
        error: "UPDATE_FAILED",
        detail: err?.message ?? String(e),
      });
    }
  });

  app.post(
    "/api/admin/users/:id/approve-to-pay",
    requireSaasAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          res.status(400).json({ error: "BAD_ID" });
          return;
        }
        const target = await findUserById(id);
        if (!target) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        await setUserActive(id, true);
        await setUserOnboardingStatus(id, "approved_to_pay");
        const access = await getAccessForUserId(id);
        res.json({ ok: true, access });
      } catch (e: any) {
        console.error("[SaaS] admin approve-to-pay", e);
        res.status(500).json({ error: "ADMIN_APPROVE_TO_PAY_FAILED" });
      }
    },
  );

  app.post(
    "/api/admin/users/:id/activate-access",
    requireSaasAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          res.status(400).json({ error: "BAD_ID" });
          return;
        }
        const parsed = grantSubBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
          return;
        }
        const target = await findUserById(id);
        if (!target) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        await setUserActive(id, true);
        const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined;
        const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined;
        if (parsed.data.startsAt && Number.isNaN(startsAt!.getTime())) {
          res.status(400).json({ error: "BAD_DATES", detail: "startsAt is not a valid date" });
          return;
        }
        if (parsed.data.endsAt && Number.isNaN(endsAt!.getTime())) {
          res.status(400).json({ error: "BAD_DATES", detail: "endsAt is not a valid date" });
          return;
        }
        await grantSubscriptionForUser(id, parsed.data.planId, {
          extraDays: parsed.data.extraDays,
          startsAt,
          endsAt,
        });
        await setUserOnboardingStatus(id, "active");
        const access = await getAccessForUserId(id);
        res.json({ ok: true, access });
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.error("SUBSCRIPTION ERROR:", e);
        if (err?.message === "PLAN_NOT_FOUND") {
          res.status(400).json({ error: "PLAN_NOT_FOUND", detail: err.message });
          return;
        }
        if (err?.message === "USER_NOT_FOUND_IN_USERS_TABLE") {
          res.status(400).json({ error: "USER_NOT_FOUND", detail: err.message });
          return;
        }
        res.status(500).json({
          error: "SUBSCRIPTION_FAILED",
          detail: err?.message ?? String(e),
        });
      }
    },
  );

  app.post(
    "/api/admin/users/:id/subscription",
    requireSaasAdmin,
    async (req: Request, res: Response) => {
      console.log("ACTIVATE SUBSCRIPTION PAYLOAD:", req.body);
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          res.status(400).json({ error: "BAD_ID" });
          return;
        }
        const parsed = grantSubBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
          return;
        }
        const target = await findUserById(id);
        if (!target) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined;
        const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined;
        if (parsed.data.startsAt && Number.isNaN(startsAt!.getTime())) {
          res.status(400).json({ error: "BAD_DATES", detail: "startsAt is not a valid date" });
          return;
        }
        if (parsed.data.endsAt && Number.isNaN(endsAt!.getTime())) {
          res.status(400).json({ error: "BAD_DATES", detail: "endsAt is not a valid date" });
          return;
        }
        await grantSubscriptionForUser(id, parsed.data.planId, {
          extraDays: parsed.data.extraDays,
          startsAt,
          endsAt,
        });
        await setUserOnboardingStatus(id, "active");
        const access = await getAccessForUserId(id);
        res.json({ ok: true, access });
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.error("SUBSCRIPTION ERROR:", e);
        if (err?.message === "PLAN_NOT_FOUND") {
          res.status(400).json({ error: "PLAN_NOT_FOUND", detail: err.message });
          return;
        }
        if (err?.message === "USER_NOT_FOUND_IN_USERS_TABLE") {
          res.status(400).json({ error: "USER_NOT_FOUND", detail: err.message });
          return;
        }
        res.status(500).json({
          error: "SUBSCRIPTION_FAILED",
          detail: err?.message ?? String(e),
        });
      }
    },
  );

  app.post(
    "/api/admin/users/:id/subscription/deactivate",
    requireSaasAdmin,
    async (req: Request, res: Response) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id)) {
          res.status(400).json({ error: "BAD_ID" });
          return;
        }
        const target = await findUserById(id);
        if (!target) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        await deactivateSubscriptionForUser(id);
        if (!isAdminRole(target.role)) {
          await setUserOnboardingStatus(
            id,
            userIsActiveish(target) ? "approved_to_pay" : "pending_approval",
          );
        }
        const access = await getAccessForUserId(id);
        res.json({ ok: true, access });
      } catch (e: any) {
        console.error("[SaaS] admin deactivate sub", e);
        res.status(500).json({ error: "ADMIN_DEACTIVATE_SUB_FAILED" });
      }
    },
  );
}
