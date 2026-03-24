import {
  pgTable,
  text,
  serial,
  doublePrecision,
  integer,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const marketState = pgTable("market_state", {
  id: serial("id").primaryKey(),
  gammaRegime: text("gamma_regime").notNull(), // "LONG GAMMA" | "SHORT GAMMA"
  totalGex: doublePrecision("total_gex").notNull(),
  gammaFlip: doublePrecision("gamma_flip").notNull(),
  distanceToFlip: doublePrecision("distance_to_flip").notNull(),
  transitionZoneStart: doublePrecision("transition_zone_start").notNull(),
  transitionZoneEnd: doublePrecision("transition_zone_end").notNull(),
  gammaAcceleration: text("gamma_acceleration").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const dealerExposure = pgTable("dealer_exposure", {
  id: serial("id").primaryKey(),
  vannaExposure: doublePrecision("vanna_exposure").notNull(),
  vannaBias: text("vanna_bias").notNull(), // "BULLISH" | "BEARISH"
  charmExposure: doublePrecision("charm_exposure").notNull(),
  charmBias: text("charm_bias").notNull(),
  gammaPressure: text("gamma_pressure").notNull(),
  gammaConcentration: doublePrecision("gamma_concentration").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const optionsPositioning = pgTable("options_positioning", {
  id: serial("id").primaryKey(),
  callWall: doublePrecision("call_wall").notNull(),
  putWall: doublePrecision("put_wall").notNull(),
  oiConcentration: doublePrecision("oi_concentration").notNull(),
  dealerPivot: doublePrecision("dealer_pivot").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const keyLevels = pgTable("key_levels", {
  id: serial("id").primaryKey(),
  gammaMagnets: doublePrecision("gamma_magnets").array().notNull(),
  shortGammaPocketStart: doublePrecision("short_gamma_pocket_start").notNull(),
  shortGammaPocketEnd: doublePrecision("short_gamma_pocket_end").notNull(),
  deepRiskPocketStart: doublePrecision("deep_risk_pocket_start").notNull(),
  deepRiskPocketEnd: doublePrecision("deep_risk_pocket_end").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const tradingScenarios = pgTable("trading_scenarios", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // "BASE", "ALT", "VOL"
  probability: integer("probability").notNull(),
  thesis: text("thesis").notNull(),
  levels: text("levels").array().notNull(),
  confirmation: text("confirmation").array().notNull(),
  invalidation: text("invalidation").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const optionsData = pgTable("options_data", {
  id: serial("id").primaryKey(),
  strike: doublePrecision("strike").notNull(),
  gamma: doublePrecision("gamma").notNull(),
  openInterest: doublePrecision("open_interest").notNull(),
  impliedVolatility: doublePrecision("implied_volatility").notNull(),
  optionType: text("option_type").notNull(), // "CALL" | "PUT"
  expiration: timestamp("expiration").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const dealerHedgingFlow = pgTable("dealer_hedging_flow", {
  id: serial("id").primaryKey(),
  hedgeFlowBias: text("hedge_flow_bias").notNull(), // "BUYING" | "SELLING" | "NEUTRAL"
  hedgeFlowIntensity: text("hedge_flow_intensity").notNull(), // "LOW" | "MEDIUM" | "HIGH"
  accelerationRisk: text("acceleration_risk").notNull(), // "LOW" | "HIGH"
  flowTriggerUp: doublePrecision("flow_trigger_up").notNull(),
  flowTriggerDown: doublePrecision("flow_trigger_down").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertMarketStateSchema = createInsertSchema(marketState).omit({ id: true, timestamp: true });
export const insertDealerExposureSchema = createInsertSchema(dealerExposure).omit({ id: true, timestamp: true });
export const insertOptionsPositioningSchema = createInsertSchema(optionsPositioning).omit({ id: true, timestamp: true });
export const insertKeyLevelsSchema = createInsertSchema(keyLevels).omit({ id: true, timestamp: true });
export const insertTradingScenariosSchema = createInsertSchema(tradingScenarios).omit({ id: true, timestamp: true });
export const insertOptionsDataSchema = createInsertSchema(optionsData).omit({ id: true, timestamp: true });
export const insertDealerHedgingFlowSchema = createInsertSchema(dealerHedgingFlow).omit({ id: true, timestamp: true });

export type MarketState = typeof marketState.$inferSelect;
export type DealerExposure = typeof dealerExposure.$inferSelect;
export type OptionsPositioning = typeof optionsPositioning.$inferSelect;
export type KeyLevels = typeof keyLevels.$inferSelect;
export type TradingScenario = typeof tradingScenarios.$inferSelect;
export type OptionData = typeof optionsData.$inferSelect;
export type DealerHedgingFlow = typeof dealerHedgingFlow.$inferSelect;

/** SaaS / terminal auth — tabla users (Neon) */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name"),
  /** DB may enforce `users_role_check`; persisted values are lowercase via `usersDbRoles`. */
  role: text("role").notNull().default("user"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptionPlans = pgTable("saas_subscription_plans", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  priceUsd: doublePrecision("price_usd").notNull(),
  durationDays: integer("duration_days").notNull(),
  paypalLink: text("paypal_link"),
  usdtAddress: text("usdt_address"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const subscriptions = pgTable("saas_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  planId: integer("plan_id")
    .notNull()
    .references(() => subscriptionPlans.id),
  status: text("status").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const payments = pgTable("saas_payments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  amountUsd: doublePrecision("amount_usd").notNull(),
  method: text("method").notNull(),
  status: text("status").notNull().default("pending"),
  externalRef: text("external_ref"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;
