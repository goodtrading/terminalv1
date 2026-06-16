/**
 * Send a test email using current .env email provider (Resend or SMTP).
 * Usage: npm run test:email -- tu@email.com
 */
import "dotenv/config";
import path from "path";
import dotenv from "dotenv";
import {
  getEmailConfigStatus,
  logEmailConfigStatus,
  resolveAppPublicUrl,
  sendTestEmail,
  verifyEmailTransport,
} from "../server/services/emailService";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const to = process.argv[2]?.trim() || process.env.TEST_EMAIL_TO?.trim();
  if (!to) {
    console.error("Usage: npm run test:email -- recipient@example.com");
    console.error("Or set TEST_EMAIL_TO in .env");
    process.exit(1);
  }

  logEmailConfigStatus();
  console.info("[test:email] resolved APP_PUBLIC_URL:", resolveAppPublicUrl());

  const config = getEmailConfigStatus();
  if (config.mode === "production-unconfigured") {
    console.error(
      "[test:email] Email not configured. Set EMAIL_PROVIDER=resend + RESEND_API_KEY, or SMTP_* vars.",
    );
    process.exit(1);
  }

  if (config.mode === "dev-console") {
    console.info("[test:email] No provider — output will appear as [email:dev] above.");
    await sendTestEmail(to);
    process.exit(0);
  }

  const verify = await verifyEmailTransport();
  if (!verify.ok && config.mode === "smtp") {
    console.error("[test:email] SMTP verify failed:", verify.detail ?? verify.error);
    process.exit(1);
  }

  await sendTestEmail(to);
  console.info("[test:email] OK — check inbox for", to);
}

main().catch((err) => {
  console.error("[test:email] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
