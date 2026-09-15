import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { ensureGoodTradingAccountForUser } from "../services/accounts/goodTradingAccountRepository";

export type AccountContextProvisioner = (userId: number) => Promise<{ accountUid: string }>;

const defaultProvisioner: AccountContextProvisioner = async (userId) => {
  const account = await ensureGoodTradingAccountForUser(userId);
  return { accountUid: account.accountUid };
};

function isValidAccountUid(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function registerAccountContextRoutes(
  app: Express,
  provisioner: AccountContextProvisioner = defaultProvisioner,
): void {
  app.post(
    "/api/account-context/bootstrap",
    requireSaasAuth,
    async (req: Request, res: Response) => {
      const userId = req.saasUser?.id;
      if (typeof userId !== "number" || !Number.isSafeInteger(userId) || userId <= 0) {
        res.status(401).json({ code: "UNAUTHENTICATED", message: "Authentication required." });
        return;
      }

      try {
        const result = await provisioner(userId);
        if (!isValidAccountUid(result.accountUid)) {
          res.status(503).json({ code: "ACCOUNT_CONTEXT_UNAVAILABLE", message: "Account context unavailable." });
          return;
        }
        res.json({ accountUid: result.accountUid });
      } catch (error) {
        if (error instanceof Error && error.message === "USER_NOT_FOUND_IN_USERS_TABLE") {
          res.status(404).json({ code: "ACCOUNT_OWNER_NOT_FOUND", message: "Authenticated account owner was not found." });
          return;
        }
        res.status(503).json({ code: "ACCOUNT_CONTEXT_UNAVAILABLE", message: "Account context unavailable." });
      }
    },
  );
}
