import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

type MailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type EmailDeliveryMode = "smtp" | "dev-console" | "production-unconfigured";

export type EmailConfigStatus = {
  mode: EmailDeliveryMode;
  nodeEnv: string;
  smtpHost: string | null;
  smtpPort: number;
  smtpUserPresent: boolean;
  smtpPassPresent: boolean;
  emailFrom: string;
  appPublicUrl: string | null;
  railwayPublicDomain: string | null;
  verificationTtlMinutes: number;
  resetTtlMinutes: number;
};

function smtpHost(): string | null {
  const v = process.env.SMTP_HOST?.trim();
  return v || null;
}

function smtpUser(): string | null {
  const v = process.env.SMTP_USER?.trim();
  return v || null;
}

function smtpPassPresent(): boolean {
  return Boolean(process.env.SMTP_PASS?.trim());
}

export function smtpConfigured(): boolean {
  return Boolean(smtpHost() && smtpUser() && smtpPassPresent());
}

export function getEmailDeliveryMode(): EmailDeliveryMode {
  if (smtpConfigured()) return "smtp";
  if (process.env.NODE_ENV === "production") return "production-unconfigured";
  return "dev-console";
}

export function resolveAppPublicUrl(): string {
  const configured = process.env.APP_PUBLIC_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim();
  if (railway) return `https://${railway.replace(/^https?:\/\//, "")}`;
  return "http://localhost:5000";
}

export function getEmailConfigStatus(): EmailConfigStatus {
  return {
    mode: getEmailDeliveryMode(),
    nodeEnv: process.env.NODE_ENV ?? "development",
    smtpHost: smtpHost(),
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUserPresent: Boolean(smtpUser()),
    smtpPassPresent: smtpPassPresent(),
    emailFrom: fromAddress(),
    appPublicUrl: process.env.APP_PUBLIC_URL?.trim() || null,
    railwayPublicDomain: process.env.RAILWAY_PUBLIC_DOMAIN?.trim() || null,
    verificationTtlMinutes: Number(process.env.AUTH_VERIFICATION_TTL_MINUTES ?? 15),
    resetTtlMinutes: Number(process.env.AUTH_RESET_TTL_MINUTES ?? 30),
  };
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || smtpUser() || "noreply@goodtrading.io";
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
}

type SmtpLikeError = Error & {
  code?: string;
  command?: string;
  response?: string;
  responseCode?: number;
  errno?: number;
  syscall?: string;
};

/** SMTP context for diagnostics — never includes SMTP_PASS. */
function smtpContextForLog(): Record<string, unknown> {
  const user = smtpUser();
  return {
    mode: getEmailDeliveryMode(),
    smtpHost: smtpHost() ?? "(missing)",
    smtpPort: Number(process.env.SMTP_PORT ?? 587),
    smtpUser: user ? maskEmail(user) : "(missing)",
    emailFrom: fromAddress(),
  };
}

function truncateResponse(value: unknown, maxLen = 500): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value.length > maxLen ? `${value.slice(0, maxLen)}…` : value;
}

/** Safe SMTP/nodemailer error fields — never logs secrets. */
function safeSmtpFailureLog(err: unknown): Record<string, unknown> {
  const base = smtpContextForLog();

  if (!(err instanceof Error)) {
    return {
      ...base,
      errorMessage: String(err),
    };
  }

  const e = err as SmtpLikeError;
  const cause = err.cause;
  const causeMessage =
    cause instanceof Error ? cause.message : cause != null ? String(cause) : undefined;

  return {
    ...base,
    errorName: e.name || undefined,
    errorMessage: e.message || undefined,
    errorCode: e.code,
    errorCommand: e.command,
    errorResponse: truncateResponse(e.response),
    errorResponseCode: e.responseCode,
    errorErrno: e.errno,
    errorSyscall: e.syscall,
    errorCauseMessage: causeMessage,
  };
}

/** @deprecated Use safeSmtpFailureLog — kept for callers expecting partial fields. */
function safeTransportError(err: unknown): Record<string, unknown> {
  const log = safeSmtpFailureLog(err);
  return {
    message: log.errorMessage,
    code: log.errorCode,
    command: log.errorCommand,
    responseCode: log.errorResponseCode,
    response: log.errorResponse,
  };
}

let cachedTransporter: Transporter | null = null;

function createTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter;

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = port === 465;

  cachedTransporter = nodemailer.createTransport({
    host: smtpHost()!,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: {
      user: smtpUser()!,
      pass: process.env.SMTP_PASS!.trim(),
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });

  return cachedTransporter;
}

/** Safe startup / diagnostic log — never prints SMTP_PASS. */
export function logEmailConfigStatus(): void {
  const status = getEmailConfigStatus();
  console.info("[email:config]", {
    mode: status.mode,
    nodeEnv: status.nodeEnv,
    smtpHost: status.smtpHost ?? "(missing)",
    smtpPort: status.smtpPort,
    smtpUserPresent: status.smtpUserPresent,
    smtpPassPresent: status.smtpPassPresent,
    emailFrom: status.emailFrom,
    appPublicUrl: resolveAppPublicUrl(),
    appPublicUrlEnvSet: Boolean(status.appPublicUrl),
    railwayPublicDomain: status.railwayPublicDomain ?? "(not set)",
    verificationTtlMinutes: status.verificationTtlMinutes,
    resetTtlMinutes: status.resetTtlMinutes,
  });

  if (status.mode === "production-unconfigured") {
    console.warn(
      "[email:config] PRODUCTION without SMTP — verification/reset emails will NOT be sent. Set SMTP_HOST, SMTP_USER, SMTP_PASS on Railway.",
    );
  }
  if (status.mode === "dev-console") {
    console.info("[email:config] Dev fallback active — emails log as [email:dev] in console.");
  }
}

/** Verifies SMTP login at startup (non-blocking). */
export async function verifyEmailTransport(): Promise<{ ok: boolean; error?: string; detail?: Record<string, unknown> }> {
  if (!smtpConfigured()) {
    return { ok: false, error: "smtp_not_configured" };
  }
  try {
    await createTransporter().verify();
    console.info("[email:transport] SMTP verify OK", {
      host: smtpHost(),
      port: Number(process.env.SMTP_PORT ?? 587),
      userPresent: Boolean(smtpUser()),
    });
    return { ok: true };
  } catch (err) {
    const detail = safeSmtpFailureLog(err);
    console.error("[email:transport] SMTP verify FAILED", detail);
    return { ok: false, error: "smtp_verify_failed", detail };
  }
}

async function sendMail(payload: MailPayload, context: string): Promise<void> {
  const mode = getEmailDeliveryMode();

  if (mode === "dev-console") {
    console.info("[email:dev]", {
      context,
      to: maskEmail(payload.to),
      subject: payload.subject,
      text: payload.text,
    });
    return;
  }

  if (mode === "production-unconfigured") {
    console.warn("[email] SMTP not configured — email NOT sent", {
      context,
      to: maskEmail(payload.to),
      subject: payload.subject,
    });
    return;
  }

  try {
    const info = await createTransporter().sendMail({
      from: fromAddress(),
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    console.info("[email] sent", {
      context,
      to: maskEmail(payload.to),
      subject: payload.subject,
      messageId: info.messageId ?? null,
      accepted: info.accepted?.length ?? 0,
      rejected: info.rejected?.length ?? 0,
    });
  } catch (err) {
    console.error("[email] send failed", {
      context,
      to: maskEmail(payload.to),
      subject: payload.subject,
      ...safeSmtpFailureLog(err),
    });
    throw err;
  }
}

export async function sendTestEmail(to: string): Promise<void> {
  const sampleResetUrl = `${resolveAppPublicUrl()}/reset-password?token=TEST_TOKEN_SAMPLE`;
  const subject = "GoodTrading — email de prueba";
  const text = [
    "Este es un email de prueba de GoodTrading.",
    "",
    "Si ves este mensaje, SMTP está configurado correctamente.",
    "",
    `Ejemplo reset URL: ${sampleResetUrl}`,
    "",
    "Código de verificación de ejemplo: 123456",
  ].join("\n");

  const html = `
    <p>Este es un email de prueba de GoodTrading.</p>
    <p>Si ves este mensaje, SMTP está configurado correctamente.</p>
    <p><a href="${sampleResetUrl}">Ejemplo enlace reset</a></p>
    <p>Código de verificación de ejemplo: <strong>123456</strong></p>
  `;

  await sendMail({ to, subject, text, html }, "test-email");
}

export async function sendVerificationCodeEmail(email: string, code: string): Promise<void> {
  const ttl = Number(process.env.AUTH_VERIFICATION_TTL_MINUTES ?? 15);
  const subject = "Tu código de verificación — GoodTrading";
  const text = [
    "Hola,",
    "",
    `Tu código de verificación GoodTrading es: ${code}`,
    "",
    `El código expira en ${ttl} minutos.`,
    "",
    "Si no solicitaste este código, ignorá este mensaje.",
  ].join("\n");

  const html = `
    <p>Hola,</p>
    <p>Tu código de verificación GoodTrading es:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${code}</p>
    <p>El código expira en ${ttl} minutos.</p>
    <p>Si no solicitaste este código, ignorá este mensaje.</p>
  `;

  await sendMail({ to: email, subject, text, html }, "verification-code");
}

export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const ttl = Number(process.env.AUTH_RESET_TTL_MINUTES ?? 30);
  const subject = "Recuperar contraseña — GoodTrading";
  const text = [
    "Hola,",
    "",
    "Recibimos una solicitud para restablecer tu contraseña de GoodTrading.",
    "",
    `Restablecer contraseña: ${resetUrl}`,
    "",
    `El enlace expira en ${ttl} minutos.`,
    "",
    "Si no solicitaste esto, ignorá este mensaje.",
  ].join("\n");

  const html = `
    <p>Hola,</p>
    <p>Recibimos una solicitud para restablecer tu contraseña de GoodTrading.</p>
    <p><a href="${resetUrl}">Restablecer contraseña</a></p>
    <p>El enlace expira en ${ttl} minutos.</p>
    <p>Si no solicitaste esto, ignorá este mensaje.</p>
  `;

  await sendMail({ to: email, subject, text, html }, "password-reset");
}
