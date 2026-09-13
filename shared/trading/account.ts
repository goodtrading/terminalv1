import { z } from "zod";
import { gtVenueIdSchema, timestampMsSchema } from "./venue";

export const gtAccountStateSchema = z.object({
  accountId: z.string().trim().min(1).max(128),
  venue: gtVenueIdSchema,
  currency: z.string().trim().min(1).max(16),
  equity: z.number().finite(),
  balance: z.number().finite(),
  availableBalance: z.number().finite(),
  marginUsed: z.number().finite().optional(),
  maintenanceMargin: z.number().finite().optional(),
  realizedPnl: z.number().finite(),
  unrealizedPnl: z.number().finite(),
  timestamp: timestampMsSchema,
  metadata: z.record(z.unknown()).optional(),
});
export type GTAccountState = z.infer<typeof gtAccountStateSchema>;
