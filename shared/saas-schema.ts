/**
 * Solo tablas SaaS/auth — usado por drizzle.config.saas.ts para `npm run db:push:saas`
 * sin mezclar diff con tablas legacy del terminal (market_state, dealer_exposure, …).
 */
export {
  users,
  subscriptionPlans,
  subscriptions,
  payments,
} from "./schema";
