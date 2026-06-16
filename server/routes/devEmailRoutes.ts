import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  getEmailConfigStatus,
  resolveAppPublicUrl,
  sendTestEmail,
  verifyEmailTransport,
} from "../services/emailService";

const testEmailBody = z.object({
  email: z.string().email(),
});

/** Dev-only email diagnostics — never registered in production. */
export function registerDevEmailRoutes(app: Express): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  app.get("/api/dev/email-config", (_req: Request, res: Response) => {
    res.json({
      ...getEmailConfigStatus(),
      resolvedAppPublicUrl: resolveAppPublicUrl(),
    });
  });

  app.post("/api/dev/test-email", async (req: Request, res: Response) => {
    const secret = process.env.DEV_EMAIL_TEST_SECRET?.trim();
    if (secret) {
      const header = req.headers["x-dev-email-secret"];
      if (header !== secret) {
        res.status(403).json({ error: "FORBIDDEN", message: "Invalid or missing x-dev-email-secret header." });
        return;
      }
    }

    const parsed = testEmailBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
      return;
    }

    try {
      const transport = await verifyEmailTransport();
      if (!transport.ok && getEmailConfigStatus().mode === "smtp") {
        res.status(503).json({
          error: "SMTP_VERIFY_FAILED",
          detail: transport.detail,
          config: getEmailConfigStatus(),
        });
        return;
      }

      await sendTestEmail(parsed.data.email);
      res.json({
        ok: true,
        to: parsed.data.email,
        mode: getEmailConfigStatus().mode,
        resolvedAppPublicUrl: resolveAppPublicUrl(),
      });
    } catch (err) {
      res.status(500).json({
        error: "TEST_EMAIL_FAILED",
        message: err instanceof Error ? err.message : String(err),
        config: getEmailConfigStatus(),
      });
    }
  });
}
