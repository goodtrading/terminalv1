import type { Express, Request, Response } from "express";
import { z } from "zod";
import { AUTH_COOKIE_NAME, clearAuthCookie, getAuthCookieOptions } from "../lib/authCookie";
import { verifyPassword } from "../lib/password";
import { signUserToken } from "../lib/jwt";
import {
  optionalSaasAuth,
  requireSaasAuth,
  requireSaasAdmin,
} from "../middleware/saasAuth";
import {
  createUser,
  ensureBootstrapAdmin,
  findUserByEmail,
  findUserById,
  listUsersForAdmin,
  setUserActive,
  setUserOnboardingStatus,
  updateUserRole,
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
  planId: z.number().int().positive(),
  extraDays: z.number().int().positive().optional(),
});

function statusToOnboardingStatus(status: string): string {
  const m: Record<string, string> = {
    pending: "pending_approval",
    approved_to_pay: "approved_to_pay",
    pending_payment_review: "pending_payment_review",
    active: "active",
    inactive: "inactive",
    rejected: "rejected",
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
      console.info(logPrefix, "insert ok", { id: user.id, email: user.email, status: user.status });

      const token = signUserToken({
        id: user.id,
        email: user.email,
        role: user.role,
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
          role: user.role,
          fullName: user.fullName ?? null,
        },
        access,
      });
    } catch (e: any) {
      console.error(logPrefix, "failed", e?.message ?? e, e?.stack);
      res.status(500).json({ error: "REGISTER_FAILED" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
        return;
      }
      const { email, password } = parsed.data;
      const user = await findUserByEmail(email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }
      const token = signUserToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });
      const access = await getAccessForUserId(user.id);
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      res.json({
        token,
        user: { id: user.id, email: user.email, role: user.role },
        access,
      });
    } catch (e: any) {
      console.error("[SaaS] login", e);
      res.status(500).json({ error: "LOGIN_FAILED" });
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
      if (!req.saasUser) {
        res.json({ user: null, access: null });
        return;
      }
      const access = await getAccessForUserId(req.saasUser.id);
      res.json({
        user: {
          id: req.saasUser.id,
          email: req.saasUser.email,
          role: req.saasUser.role,
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
            role: u.role,
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
      if (parsed.data.role) {
        await updateUserRole(id, parsed.data.role);
      }
      if (parsed.data.isActive !== undefined) {
        await setUserActive(id, parsed.data.isActive);
      }
      if (parsed.data.onboardingStatus) {
        await setUserOnboardingStatus(id, parsed.data.onboardingStatus);
      }
      const updated = await findUserById(id);
      res.json({ user: updated });
    } catch (e: any) {
      console.error("[SaaS] admin patch user", e);
      res.status(500).json({ error: "ADMIN_PATCH_FAILED" });
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
        await grantSubscriptionForUser(id, parsed.data.planId, parsed.data.extraDays);
        await setUserOnboardingStatus(id, "active");
        const access = await getAccessForUserId(id);
        res.json({ ok: true, access });
      } catch (e: any) {
        console.error("[SaaS] admin activate-access", e);
        res.status(500).json({ error: "ADMIN_ACTIVATE_ACCESS_FAILED" });
      }
    },
  );

  app.post(
    "/api/admin/users/:id/subscription",
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
        await grantSubscriptionForUser(id, parsed.data.planId, parsed.data.extraDays);
        await setUserOnboardingStatus(id, "active");
        const access = await getAccessForUserId(id);
        res.json({ ok: true, access });
      } catch (e: any) {
        console.error("[SaaS] admin grant sub", e);
        res.status(500).json({ error: "ADMIN_GRANT_FAILED" });
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
        if (target.role !== "admin") {
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
