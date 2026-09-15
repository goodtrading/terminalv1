import {
  pgTable,
  text,
  serial,
  doublePrecision,
  numeric,
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
  gammaFlip: doublePrecision("gamma_flip"),
  distanceToFlip: doublePrecision("distance_to_flip"),
  transitionZoneStart: doublePrecision("transition_zone_start"),
  transitionZoneEnd: doublePrecision("transition_zone_end"),
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
  shortGammaPocketStart: doublePrecision("short_gamma_pocket_start"),
  shortGammaPocketEnd: doublePrecision("short_gamma_pocket_end"),
  deepRiskPocketStart: doublePrecision("deep_risk_pocket_start"),
  deepRiskPocketEnd: doublePrecision("deep_risk_pocket_end"),
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
  hedgeFlowBias: text("hedge_flow_bias"), // "BUYING" | "SELLING" | "NEUTRAL"
  hedgeFlowIntensity: text("hedge_flow_intensity"), // "LOW" | "MEDIUM" | "HIGH"
  accelerationRisk: text("acceleration_risk"), // "LOW" | "HIGH"
  flowTriggerUp: doublePrecision("flow_trigger_up"),
  flowTriggerDown: doublePrecision("flow_trigger_down"),
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
export type DealerExposure = Omit<typeof dealerExposure.$inferSelect, "vannaExposure" | "charmExposure" | "vannaBias" | "charmBias"> & {
  vannaExposure: number | null;
  charmExposure: number | null;
  liveVannaExposure: number | null;
  liveVannaGrossAbsExposure: number | null;
  liveVannaDirectionalRatio: number | null;
  liveVannaValidRows: number | null;
  liveVannaTotalEligibleRows: number | null;
  liveVannaCallSignedContribution: number | null;
  liveVannaPutSignedContribution: number | null;
  liveVannaPositiveContribution: number | null;
  liveVannaNegativeContribution: number | null;
  liveCharmExposure: number | null;
  liveCharmGrossAbsExposure: number | null;
  liveCharmDirectionalRatio: number | null;
  liveCharmValidRows: number | null;
  liveCharmTotalEligibleRows: number | null;
  liveCharmCallSignedContribution: number | null;
  liveCharmPutSignedContribution: number | null;
  liveCharmPositiveContribution: number | null;
  liveCharmNegativeContribution: number | null;
  heuristicVannaScore: number | null;
  heuristicCharmScore: number | null;
  vannaBias: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  charmBias: "BULLISH" | "BEARISH" | "NEUTRAL" | null;
  vannaDynamics?: TemporalExposureDynamics | null;
  charmDynamics?: TemporalExposureDynamics | null;
};

export type TemporalExposureSign = "NO_DATA" | "NEGATIVE" | "NEUTRAL" | "POSITIVE";
export type TemporalExposureBalanceState = "NO_DATA" | "BALANCED" | "MIXED" | "DIRECTIONAL";
export type TemporalExposureFragility = "NO_DATA" | "FRAGILE" | "MIXED" | "ROBUST";
export type TemporalExposureDynamicState = "NO_DATA" | "INTENSIFYING" | "NEUTRALIZING" | "STABLE" | "CROSSING";
export type TemporalExposureSpeed = "SLOW" | "MODERATE" | "FAST";
export type TemporalExposureSignTransition =
  | "NONE"
  | "NEGATIVE_TO_POSITIVE"
  | "POSITIVE_TO_NEGATIVE"
  | "NEGATIVE_TO_NEUTRAL"
  | "POSITIVE_TO_NEUTRAL"
  | "NEUTRAL_TO_POSITIVE"
  | "NEUTRAL_TO_NEGATIVE";

export type ExposureMetricSnapshot = {
  net: number | null;
  gross: number | null;
  positiveContribution: number | null;
  negativeContribution: number | null;
  directionalRatio: number | null;
};

export type TemporalExposureHorizonAnalysis = {
  available: boolean;
  lookbackTargetTimestamp: number;
  previousTimestamp: number | null;
  previousNet: number | null;
  deltaAbsolute: number | null;
  normalizedChange: number | null;
  dynamicState: TemporalExposureDynamicState;
  speed: TemporalExposureSpeed | null;
  signTransition: TemporalExposureSignTransition;
};

export type TemporalExposureDynamics = {
  snapshotTimestamp: number;
  historyLength: number;
  historyWarmup: boolean;
  current: {
    net: number | null;
    gross: number | null;
    sign: TemporalExposureSign;
    directionalRatio: number | null;
    balanceState: TemporalExposureBalanceState;
    fragility: TemporalExposureFragility;
    positiveContribution: number | null;
    negativeContribution: number | null;
  };
  horizons: Record<"1m" | "5m" | "15m", TemporalExposureHorizonAnalysis>;
};

export type DealerHedgeSensitivity = {
  gammaUsdPerDollar: number | null;
  vannaUsdPerVolPoint: number | null;
  vannaGrossAbsUsdPerVolPoint: number | null;
  vannaDirectionalRatio: number | null;
  charmUsdPerDay: number | null;
  charmGrossAbsUsdPerDay: number | null;
  charmDirectionalRatio: number | null;
  vannaValidRows: number | null;
  vannaTotalEligibleRows: number | null;
  charmValidRows: number | null;
  charmTotalEligibleRows: number | null;
  source: "LIVE_DERIBIT" | "BOOTSTRAP" | "NO_DATA";
};

export type DealerHedgeStressScenarioType =
  | "SPOT_UP_1PCT"
  | "SPOT_DOWN_1PCT"
  | "VOL_UP_1PT"
  | "TIME_DECAY_1D";

export type DealerHedgeStressScenario = {
  scenarioType: DealerHedgeStressScenarioType;
  deltaSpotUsd: number | null;
  deltaIvVolPoints: number;
  deltaDays: number;
  gammaOptionDeltaChangeUsd: number | null;
  vannaOptionDeltaChangeUsd: number | null;
  charmOptionDeltaChangeUsd: number | null;
  optionDeltaChangeUsd: number | null;
  requiredHedgeTradeUsd: number | null;
  hedgeAction: "BUY" | "SELL" | "NEUTRAL" | null;
  source: "LIVE_DERIBIT" | "BOOTSTRAP" | "NO_DATA";
  vannaCoverage: number | null;
  charmCoverage: number | null;
};

export type DealerHedgeStructuralPressure = {
  score: number | null;
  bias: "BUYING" | "SELLING" | "NEUTRAL" | null;
  intensity: "LOW" | "MEDIUM" | "HIGH" | null;
  accelerationRisk: "LOW" | "MEDIUM" | "HIGH" | null;
  triggerZone: string | null;
  stressScore: number | null;
};

export type DealerHedgeState = {
  source: DealerHedgeSensitivity["source"];
  sensitivity: DealerHedgeSensitivity;
  standardizedStress: DealerHedgeStressScenario[];
  structuralPressure: DealerHedgeStructuralPressure | null;
  metadata: {
    structuralPositioningProxy: true;
    observedDealerFlow: false;
    expectedFlowForecast: false;
  };
};

export type GravityMapType = "MAGNET" | "TRANSITION" | "REPULSION" | "ACCELERATION" | "NEUTRAL";
export type GravityMapStrength = "WEAK" | "MODERATE" | "HIGH" | "EXTREME";

export type GravityMapLevel = {
  price: number;
  zoneLow: number;
  zoneHigh: number;
  gravityScore: number; // Relative structural composite score, not a probability.
  type: GravityMapType; // Local structural context only.
  strength: GravityMapStrength; // Score-band classification only.
  directionBias: "UP" | "DOWN" | "NEUTRAL";
  oiUsd: number;
  gammaConfluence: number;
  liquidityConfluence: number;
  distanceScore: number;
  pressureAlignmentScore: number;
  shortGammaBoost: number;
  summary: string;
  reasons: string[];
};

export type GravityMapState = {
  semanticType: "RELATIVE_STRUCTURAL_SCORE";
  status: "INACTIVE" | "ACTIVE";
  primaryGravityLevel: GravityMapLevel | null;
  secondaryGravityLevel: GravityMapLevel | null;
  primaryMagnet: GravityMapLevel | null; // Legacy alias.
  secondaryMagnet: GravityMapLevel | null; // Legacy alias.
  repulsionZones: GravityMapLevel[];
  accelerationZones: GravityMapLevel[];
  bias: "UPWARD_PULL" | "DOWNWARD_PULL" | "BALANCED" | "NEUTRAL";
  summary: string;
  metadata: {
    calibratedProbability: false;
    predictionHorizon: null;
    historicallyCalibrated: false;
  };
  debug?: Record<string, unknown>;
};

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
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationCodeHash: text("verification_code_hash"),
  verificationCodeExpiresAt: timestamp("verification_code_expires_at"),
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetExpiresAt: timestamp("password_reset_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

/** Broker-agnostic logical trading identity, distinct from users.id. */
export const goodTradingAccounts = pgTable("goodtrading_accounts", {
  id: serial("id").primaryKey(),
  accountUid: text("account_uid").notNull().unique(),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Payment = typeof payments.$inferSelect;

/** Optional Deribit summary fields surfaced on `GET /api/terminal/state` → `options`. */
export type TerminalStateOptionsGammaExtras = {
  dealerHedgeState?: DealerHedgeState;
  gammaFlipGlobal?: number | null;
  gammaFlipGlobalSource?: "fresh_snapshot" | "none" | "legacy_structural_live";
  gammaFlipGlobalDebug?: {
    staleSnapshotFlip: number | null;
    staleSnapshotSpot: number | null;
    legacyLiveSpotFlip: number | null;
    legacyAtFileSpotFlip: number | null;
    legacyCrossings?: number[];
    gammaFlipStructuralLive?: number | null;
    reason: string;
  } | null;
  gammaFlipBroad?: number | null;
  gammaFlipLocal?: number | null;
  gammaRegimeLocal?: "LONG GAMMA" | "SHORT GAMMA" | null;
  localTransitionZoneStart?: number | null;
  localTransitionZoneEnd?: number | null;
  localFlipReason?: string | null;
  gammaFlipOperationalLegacy?: number | null;
  shortGammaPockets?: {
    status: "NONE" | "IDLE" | "WATCH" | "ACTIVE" | "FAILED" | "EXPANDING";
    nearest: {
      id: string;
      direction: "UPPER" | "LOWER";
      rangeLow: number;
      rangeHigh: number;
      status: "NONE" | "IDLE" | "WATCH" | "ACTIVE" | "FAILED" | "EXPANDING";
      risk: "LOW" | "MEDIUM" | "HIGH";
      confidence: number;
      relationToFlip: "ABOVE_FLIP" | "BELOW_FLIP" | "NEAR_FLIP" | "INSIDE_TRANSITION";
      relatedMagnet?: number;
      relatedWall: "CALL_WALL" | "PUT_WALL" | null;
      explanation: string;
      activationCondition: string;
    } | null;
    pockets: Array<{
      id: string;
      direction: "UPPER" | "LOWER";
      rangeLow: number;
      rangeHigh: number;
      status: "NONE" | "IDLE" | "WATCH" | "ACTIVE" | "FAILED" | "EXPANDING";
      risk: "LOW" | "MEDIUM" | "HIGH";
      confidence: number;
      relationToFlip: "ABOVE_FLIP" | "BELOW_FLIP" | "NEAR_FLIP" | "INSIDE_TRANSITION";
      relatedMagnet?: number;
      relatedWall: "CALL_WALL" | "PUT_WALL" | null;
      explanation: string;
      activationCondition: string;
    }>;
    summary: string;
  } | null;
};

export const goodtradingOrderIntents = pgTable("goodtrading_order_intents", {
  id: text("id").primaryKey(),
  logicalOrderUid: text("logical_order_uid").notNull().unique(),
  goodTradingAccountUid: text("goodtrading_account_uid").notNull(),
  executionBroker: text("execution_broker").notNull(),
  executionEnvironment: text("execution_environment").notNull(),
  executionMarketInstrument: text("execution_market_instrument").notNull(),
  executionMarketVenue: text("execution_market_venue").notNull(),
  executionMarketType: text("execution_market_type").notNull(),
  canonicalBaseAsset: text("canonical_base_asset").notNull(),
  canonicalQuoteAsset: text("canonical_quote_asset").notNull(),
  canonicalSettlementAsset: text("canonical_settlement_asset").notNull(),
  canonicalProductType: text("canonical_product_type").notNull(),
  canonicalContractStyle: text("canonical_contract_style"),
  canonicalExpiry: timestamp("canonical_expiry", { withTimezone: true }),
  sourceNativeSymbol: text("source_native_symbol").notNull(),
  sourceNativeInstrumentId: text("source_native_instrument_id"),
  marketMetadataSource: text("market_metadata_source").notNull(),
  marketMappingPolicy: text("market_mapping_policy").notNull(),
  requestedSide: text("requested_side").notNull(),
  orderType: text("order_type").notNull(),
  requestedSize: numeric("requested_size").notNull(),
  requestedSizeUnit: text("requested_size_unit").notNull(),
  requestedSizingMode: text("requested_sizing_mode"),
  resolvedQuantity: numeric("resolved_quantity").notNull(),
  resolvedQuantityUnit: text("resolved_quantity_unit").notNull(),
  limitPrice: numeric("limit_price").notNull(),
  stopLossPrice: numeric("stop_loss_price"),
  takeProfitPrice: numeric("take_profit_price"),
  timeInForce: text("time_in_force"),
  postOnly: boolean("post_only"),
  reduceOnly: boolean("reduce_only"),
  requestIdempotencyKey: text("request_idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const goodtradingOrderSubmissionAttempts = pgTable("goodtrading_order_submission_attempts", {
  id: text("id").primaryKey(),
  intentId: text("intent_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  brokerClientOrderId: text("broker_client_order_id").notNull().unique(),
  submittedQuantity: numeric("submitted_quantity"),
  transportState: text("transport_state").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  responseAt: timestamp("response_at", { withTimezone: true }),
  outcomeAt: timestamp("outcome_at", { withTimezone: true }),
  reconciliationRequiredAt: timestamp("reconciliation_required_at", { withTimezone: true }),
  brokerOrderId: text("broker_order_id"),
  rawBrokerStatus: text("raw_broker_status"),
  httpStatus: integer("http_status"),
  errorCode: text("error_code"),
  errorClass: text("error_class"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});