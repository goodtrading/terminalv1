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
  isEmailVerified,
  issueVerificationCodeForUser,
  markEmailVerified,
  verificationCodeValid,
  updateUserPassword,
  setPasswordResetToken,
  clearPasswordResetToken,
  passwordResetTokenValid,
  findUserByValidResetToken,
  userMayAuthenticate,
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
import { ensureAuthSchemaMigration } from "../services/authMigrationService";
import { sendPasswordResetEmail, sendVerificationCodeEmail } from "../services/emailService";
import { generatePasswordResetToken } from "../lib/authTokens";
import { authRateLimit } from "../middleware/authRateLimit";

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

const verifyEmailBody = z.object({
  code: z.string().min(6).max(6),
});

const forgotPasswordBody = z.object({
  email: z.string().email(),
});

const resetPasswordBody = z.object({
  token: z.string().min(16),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
});

const changePasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
  confirmPassword: z.string().min(8),
});

function serializeAuthUser(user: Awaited<ReturnType<typeof findUserById>> & object) {
  return {
    id: user.id,
    email: user.email,
    role: dbRoleToApiRole(user.role),
    fullName: user.fullName,
    emailVerified: isEmailVerified(user),
  };
}

function appPublicUrl(req: Request): string {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway}`;
  const host = req.get("host");
  return `${req.protocol}://${host ?? "localhost:5000"}`;
}

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
      await ensureAuthSchemaMigration();
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

  app.post("/api/auth/register", authRateLimit("register", 8, 15 * 60_000), async (req: Request, res: Response) => {
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
        res.status(409).json({
          error: "EMAIL_TAKEN",
          message: "Ya existe una cuenta con este email",
        });
        return;
      }

      const user = await createUser(normalizedEmail, password, "user", { fullName });
      console.info(logPrefix, "insert ok", { id: user.id, email: user.email, fullName: user.fullName, status: user.status });

      let verificationSent = false;
      try {
        const code = await issueVerificationCodeForUser(user.id);
        await sendVerificationCodeEmail(user.email, code);
        verificationSent = true;
      } catch (emailErr) {
        console.error(logPrefix, "verification email failed", emailErr);
      }

      const token = signUserToken({
        id: user.id,
        email: user.email,
        role: dbRoleToApiRole(user.role),
      });
      const access = await getAccessForUserId(user.id);
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      res.status(201).json({
        message: "Account created. Verificá tu email para continuar.",
        status: user.status,
        token,
        user: serializeAuthUser(user),
        access,
        requiresEmailVerification: true,
        verificationEmailSent: verificationSent,
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

  app.post("/api/auth/login", authRateLimit("login", 12, 15 * 60_000), async (req: Request, res: Response) => {
    const logPrefix = "[auth-login]";
    console.log(logPrefix, "request received");
    console.log(logPrefix, "email provided:", !!req.body?.email);
    console.log(logPrefix, "password provided:", !!req.body?.password);

    try {
      const { pool } = await import("../db");
      console.log(logPrefix, "DATABASE_URL present:", !!process.env.DATABASE_URL);
      console.log(logPrefix, "DB pool initialized:", !!pool);
      
      if (!pool) {
        console.error(logPrefix, "DB pool is null - DATABASE_URL missing or invalid");
        return res.status(500).json({ error: "DATABASE_NOT_CONFIGURED" });
      }
      
      // Test DB connection
      console.log(logPrefix, "testing DB connection with SELECT 1");
      const dbTest = await pool.query('SELECT 1');
      console.log(logPrefix, "DB connection test:", dbTest.rows.length > 0 ? "OK" : "FAILED");

      const parsed = loginBody.safeParse(req.body);
      if (!parsed.success) {
        console.warn(logPrefix, "validation failed:", parsed.error.flatten());
        res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
        return;
      }
      
      const { email, password } = parsed.data;
      console.log(logPrefix, "normalized email:", email);
      console.log(logPrefix, "DB query started");
      
      const user = await findUserByEmail(email);
      console.log(logPrefix, "user found:", !!user);
      
      if (!user) {
        console.warn(logPrefix, "user not found");
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }
      
      console.log(logPrefix, "user role:", user.role);
      console.log(logPrefix, "user status:", user.status);
      console.log(logPrefix, "password_hash present:", !!user.passwordHash);
      
      // Check password hash format
      const hashFormat = user.passwordHash?.substring(0, 4) || "unknown";
      console.log(logPrefix, "password hash format starts with:", hashFormat);
      
      console.log(logPrefix, "password compare started");
      const passwordValid = verifyPassword(password, user.passwordHash);
      console.log(logPrefix, "password compare result:", passwordValid);
      
      if (!passwordValid) {
        console.warn(logPrefix, "invalid password");
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      if (!userMayAuthenticate(user)) {
        res.status(403).json({ error: "ACCOUNT_DISABLED" });
        return;
      }
      
      console.log(logPrefix, "token generation started");
      const token = signUserToken({
        id: user.id,
        email: user.email,
        role: dbRoleToApiRole(user.role),
      });
      console.log(logPrefix, "token generated successfully");
      
      console.log(logPrefix, "fetching access for user");
      const access = await getAccessForUserId(user.id);
      console.log(logPrefix, "access fetched:", access.allowed);
      
      console.log(logPrefix, "setting cookie");
      res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
      console.log(logPrefix, "cookie set successfully");
      
      console.log(logPrefix, "response sent", { 
        userId: user.id, 
        email: user.email, 
        accessAllowed: access.allowed 
      });
      
      res.json({
        token,
        user: serializeAuthUser(user),
        access,
        requiresEmailVerification: !isEmailVerified(user),
      });
    } catch (e: any) {
      console.error(logPrefix, "login failed:", {
        message: e?.message,
        code: e?.code,
        detail: e?.detail,
        constraint: e?.constraint,
        table: e?.table,
        column: e?.column,
      });
      res.status(500).json({ 
        error: "AUTH_LOGIN_FAILED",
        reason: e?.message || "Internal server error"
      });
    }
  });

  app.post("/api/auth/logout", (_req: Request, res: Response) => {
    clearAuthCookie(res);
    res.json({ ok: true });
  });

  app.get("/api/auth/me", optionalSaasAuth, async (req: Request, res: Response) => {
    const logPrefix = "[auth-me]";
    console.log(logPrefix, "request received");
    console.log(logPrefix, "session exists:", !!req.session);
    console.log(logPrefix, "session userId:", req.session?.userId);
    
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    try {
      console.log(logPrefix, "resolving authenticated user");
      const { user, tokenSource, diagnostic } = await resolveAuthenticatedUser(req, {
        enforceMayAuthenticate: false,
      });
      const authenticated = Boolean(user);
      console.log(logPrefix, "authenticated:", authenticated);
      console.log(logPrefix, "tokenSource:", tokenSource);
      console.log(logPrefix, "user found:", !!user);
      
      logAuthMeDiagnostic(
        req,
        authenticated,
        user?.id ?? null,
        tokenSource,
        diagnostic,
      );
      
      if (!user) {
        console.log(logPrefix, "no user - returning unauthenticated");
        res.json({ authenticated: false, user: null, access: null });
        return;
      }
      
      console.log(logPrefix, "user id:", user.id);
      console.log(logPrefix, "user email:", user.email);
      console.log(logPrefix, "user role:", user.role);
      
      if (req.saasUser?.id !== user.id) {
        req.saasUser = user;
        req.user = user;
      }
      
      console.log(logPrefix, "fetching access for user");
      const access = await getAccessForUserId(user.id);
      const dbUser = await findUserById(user.id);
      if (!dbUser) {
        res.json({ authenticated: false, user: null, access: null });
        return;
      }
      console.log(logPrefix, "access fetched:", access.allowed);
      console.log(logPrefix, "response sent");
      
      res.json({
        authenticated: true,
        user: serializeAuthUser(dbUser),
        access,
      });
    } catch (e: any) {
      console.error(logPrefix, "error:", {
        message: e?.message,
        code: e?.code,
        detail: e?.detail,
        constraint: e?.constraint,
        table: e?.table,
        column: e?.column,
      });
      res.status(500).json({ 
        error: "AUTH_ME_FAILED",
        reason: e?.message || "Internal server error"
      });
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

  app.post(
    "/api/auth/verify-email",
    authRateLimit("verify-email", 10, 15 * 60_000),
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const parsed = verifyEmailBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
          return;
        }
        const dbUser = await findUserById(req.saasUser!.id);
        if (!dbUser) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        if (isEmailVerified(dbUser)) {
          res.json({ ok: true, alreadyVerified: true });
          return;
        }
        if (!verificationCodeValid(dbUser, parsed.data.code)) {
          res.status(400).json({ error: "INVALID_CODE", message: "Código inválido o expirado." });
          return;
        }
        const updated = await markEmailVerified(dbUser.id);
        res.json({ ok: true, user: updated ? serializeAuthUser(updated) : undefined });
      } catch (e) {
        console.error("[SaaS] verify-email", e);
        res.status(500).json({ error: "VERIFY_EMAIL_FAILED" });
      }
    },
  );

  app.post(
    "/api/auth/resend-verification-code",
    authRateLimit("resend-verification", 5, 15 * 60_000),
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const dbUser = await findUserById(req.saasUser!.id);
        if (!dbUser) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        if (isEmailVerified(dbUser)) {
          res.json({ ok: true, alreadyVerified: true });
          return;
        }
        const code = await issueVerificationCodeForUser(dbUser.id);
        await sendVerificationCodeEmail(dbUser.email, code);
        res.json({ ok: true, message: "Código reenviado." });
      } catch (e) {
        console.error("[SaaS] resend-verification", e);
        res.status(500).json({ error: "RESEND_VERIFICATION_FAILED" });
      }
    },
  );

  app.post(
    "/api/auth/forgot-password",
    authRateLimit("forgot-password", 6, 15 * 60_000),
    async (req: Request, res: Response) => {
      const generic = {
        ok: true,
        message:
          "Si el email existe en GoodTrading, recibirás instrucciones para recuperar tu cuenta.",
      };
      try {
        const parsed = forgotPasswordBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
          return;
        }
        const email = parsed.data.email.toLowerCase().trim();
        const user = await findUserByEmail(email);
        if (user) {
          const token = generatePasswordResetToken();
          await setPasswordResetToken(user.id, token);
          const resetUrl = `${appPublicUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
          await sendPasswordResetEmail(user.email, resetUrl);
        }
        res.json(generic);
      } catch (e) {
        console.error("[SaaS] forgot-password", e);
        res.json(generic);
      }
    },
  );

  app.post(
    "/api/auth/reset-password",
    authRateLimit("reset-password", 8, 15 * 60_000),
    async (req: Request, res: Response) => {
      try {
        const parsed = resetPasswordBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
          return;
        }
        if (parsed.data.password !== parsed.data.confirmPassword) {
          res.status(400).json({ error: "PASSWORD_MISMATCH" });
          return;
        }
        const match = await findUserByValidResetToken(parsed.data.token);
        if (!match) {
          res.status(400).json({ error: "INVALID_TOKEN", message: "Enlace inválido o expirado." });
          return;
        }
        await updateUserPassword(match.id, parsed.data.password);
        await clearPasswordResetToken(match.id);
        res.json({ ok: true, message: "Contraseña actualizada. Podés iniciar sesión." });
      } catch (e) {
        console.error("[SaaS] reset-password", e);
        res.status(500).json({ error: "RESET_PASSWORD_FAILED" });
      }
    },
  );

  app.post(
    "/api/auth/change-password",
    authRateLimit("change-password", 8, 15 * 60_000),
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const parsed = changePasswordBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
          return;
        }
        if (parsed.data.newPassword !== parsed.data.confirmPassword) {
          res.status(400).json({ error: "PASSWORD_MISMATCH" });
          return;
        }
        const dbUser = await findUserById(req.saasUser!.id);
        if (!dbUser) {
          res.status(404).json({ error: "NOT_FOUND" });
          return;
        }
        if (!verifyPassword(parsed.data.currentPassword, dbUser.passwordHash)) {
          res.status(400).json({ error: "INVALID_CURRENT_PASSWORD" });
          return;
        }
        await updateUserPassword(dbUser.id, parsed.data.newPassword);
        const token = signUserToken({
          id: dbUser.id,
          email: dbUser.email,
          role: dbRoleToApiRole(dbUser.role),
        });
        res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
        res.json({ ok: true, token, message: "Contraseña actualizada." });
      } catch (e) {
        console.error("[SaaS] change-password", e);
        res.status(500).json({ error: "CHANGE_PASSWORD_FAILED" });
      }
    },
  );

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
    const logPrefix = "[admin-users]";
    console.log(logPrefix, "request received");
    try {
      const { pool } = await import("../db");
      console.log(logPrefix, "DATABASE_URL present:", !!process.env.DATABASE_URL);
      console.log(logPrefix, "DB pool initialized:", !!pool);
      
      if (!pool) {
        console.error(logPrefix, "DB pool is null - DATABASE_URL missing or invalid");
        return res.status(500).json({ error: "DATABASE_NOT_CONFIGURED" });
      }
      
      console.log(logPrefix, "DB query started");
      const users = await listUsersForAdmin();
      console.log(logPrefix, "DB query success count:", users.length);
      
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
      console.error(logPrefix, "DB query failed:", {
        message: e?.message,
        code: e?.code,
        detail: e?.detail,
        constraint: e?.constraint,
        table: e?.table,
      });
      res.status(500).json({ error: "ADMIN_LIST_FAILED", detail: e?.message });
    }
  });

  app.get("/api/admin/db-health", requireSaasAdmin, async (_req: Request, res: Response) => {
    const logPrefix = "[admin-db-health]";
    console.log(logPrefix, "request received");
    try {
      const { pool } = await import("../db");
      console.log(logPrefix, "DATABASE_URL present:", !!process.env.DATABASE_URL);
      console.log(logPrefix, "DB pool initialized:", !!pool);
      
      if (!pool) {
        console.error(logPrefix, "DB pool is null - DATABASE_URL missing or invalid");
        return res.status(500).json({ 
          ok: false, 
          reason: "DATABASE_URL_MISSING" 
        });
      }
      
      // Test basic connection
      console.log(logPrefix, "testing DB connection with SELECT 1");
      const testResult = await pool.query('SELECT 1');
      console.log(logPrefix, "SELECT 1 result:", testResult.rows.length > 0 ? "OK" : "FAILED");
      
      if (!testResult.rows || testResult.rows.length === 0) {
        return res.status(500).json({ 
          ok: false, 
          reason: "DB_CONNECTION_FAILED" 
        });
      }
      
      // Check if users table exists
      console.log(logPrefix, "checking users table existence");
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);
      const usersTableExists = tableCheck.rows[0]?.exists === true;
      console.log(logPrefix, "users table exists:", usersTableExists);
      
      if (!usersTableExists) {
        return res.status(500).json({ 
          ok: false, 
          reason: "USERS_TABLE_MISSING" 
        });
      }
      
      // Count users
      console.log(logPrefix, "counting users");
      const countResult = await pool.query('SELECT COUNT(*) as count FROM users');
      const usersCount = parseInt(countResult.rows[0]?.count || '0', 10);
      console.log(logPrefix, "users count:", usersCount);
      
      // Check subscriptions table
      console.log(logPrefix, "checking subscriptions table existence");
      const subTableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'subscriptions'
        );
      `);
      const subsTableExists = subTableCheck.rows[0]?.exists === true;
      console.log(logPrefix, "subscriptions table exists:", subsTableExists);
      
      res.json({
        ok: true,
        dbConnected: true,
        usersTableExists,
        usersCount,
        subscriptionsTableExists: subsTableExists,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error(logPrefix, "DB health check failed:", {
        message: e?.message,
        code: e?.code,
        detail: e?.detail,
      });
      res.status(500).json({ 
        ok: false, 
        reason: "QUERY_FAILED",
        detail: e?.message
      });
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
