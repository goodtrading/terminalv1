import type { PoolClient } from "pg";
import { pool } from "../../db";
import {
  createDurableGoodTradingOrderIntent,
  createDurableSubmissionAttempt,
  type DurableGoodTradingOrderIntent,
  type DurableGoodTradingOrderIntentInput,
  type DurableSubmissionAttempt,
  type DurableSubmissionAttemptInput,
} from "../../../shared/durableOrderIntent";

export type CreateDurableIntentWithInitialAttemptInput = Readonly<{
  intent: DurableGoodTradingOrderIntentInput;
  attempt: DurableSubmissionAttemptInput;
}>;

export type CreatedDurableIntentWithAttempt = Readonly<{
  intent: DurableGoodTradingOrderIntent;
  attempt: DurableSubmissionAttempt;
}>;

function requirePool() {
  if (!pool) throw new Error("DATABASE_UNAVAILABLE");
  return pool;
}

function mapIntent(row: Record<string, unknown>): DurableGoodTradingOrderIntent {
  return createDurableGoodTradingOrderIntent({
    logicalOrderUid: String(row.logical_order_uid),
    goodTradingAccountUid: String(row.goodtrading_account_uid),
    executionBroker: String(row.execution_broker),
    executionEnvironment: String(row.execution_environment),
    executionMarketInstrument: String(row.execution_market_instrument),
    executionMarketVenue: String(row.execution_market_venue),
    executionMarketType: String(row.execution_market_type) as "Spot" | "Perpetual",
    canonicalBaseAsset: String(row.canonical_base_asset),
    canonicalQuoteAsset: String(row.canonical_quote_asset),
    canonicalSettlementAsset: String(row.canonical_settlement_asset),
    canonicalProductType: String(row.canonical_product_type) as "Spot" | "Perpetual",
    canonicalContractStyle: row.canonical_contract_style == null ? null : String(row.canonical_contract_style) as "Linear" | "Inverse",
    canonicalExpiry: null,
    sourceNativeSymbol: String(row.source_native_symbol),
    sourceNativeInstrumentId: row.source_native_instrument_id == null ? null : String(row.source_native_instrument_id),
    marketMetadataSource: String(row.market_metadata_source),
    marketMappingPolicy: String(row.market_mapping_policy),
    requestedSide: String(row.requested_side) as "buy" | "sell",
    orderType: "LIMIT",
    requestedSize: String(row.requested_size),
    requestedSizeUnit: String(row.requested_size_unit) as "BTC" | "USDT",
    requestedSizingMode: row.requested_sizing_mode == null ? null : String(row.requested_sizing_mode) as "quantity" | "notional" | "margin",
    resolvedQuantity: String(row.resolved_quantity),
    resolvedQuantityUnit: String(row.resolved_quantity_unit) as "BTC" | "USDT",
    limitPrice: String(row.limit_price),
    stopLossPrice: row.stop_loss_price == null ? null : String(row.stop_loss_price),
    takeProfitPrice: row.take_profit_price == null ? null : String(row.take_profit_price),
    timeInForce: row.time_in_force == null ? null : String(row.time_in_force) as "GTC" | "IOC" | "FOK" | "GTD" | "DAY",
    postOnly: row.post_only == null ? null : Boolean(row.post_only),
    reduceOnly: row.reduce_only == null ? null : Boolean(row.reduce_only),
    requestIdempotencyKey: row.request_idempotency_key == null ? null : String(row.request_idempotency_key),
  });
}

function mapAttempt(row: Record<string, unknown>): DurableSubmissionAttempt {
  return createDurableSubmissionAttempt({
    attemptId: String(row.id),
    intentId: String(row.intent_id),
    attemptNumber: Number(row.attempt_number),
    brokerClientOrderId: String(row.broker_client_order_id),
    submittedQuantity: row.submitted_quantity == null ? null : String(row.submitted_quantity),
    transportState: String(row.transport_state) as DurableSubmissionAttempt["transportState"],
    startedAt: row.started_at instanceof Date ? row.started_at : null,
    responseAt: row.response_at instanceof Date ? row.response_at : null,
    outcomeAt: row.outcome_at instanceof Date ? row.outcome_at : null,
    reconciliationRequiredAt: row.reconciliation_required_at instanceof Date ? row.reconciliation_required_at : null,
    brokerOrderId: row.broker_order_id == null ? null : String(row.broker_order_id),
    rawBrokerStatus: row.raw_broker_status == null ? null : String(row.raw_broker_status),
    httpStatus: row.http_status == null ? null : Number(row.http_status),
    errorCode: row.error_code == null ? null : String(row.error_code),
    errorClass: row.error_class == null ? null : String(row.error_class),
  });
}

const intentColumns = `
  id, logical_order_uid, goodtrading_account_uid, execution_broker,
  execution_environment, execution_market_instrument, execution_market_venue,
  execution_market_type, canonical_base_asset, canonical_quote_asset,
  canonical_settlement_asset, canonical_product_type, canonical_contract_style,
  canonical_expiry, source_native_symbol, source_native_instrument_id,
  market_metadata_source, market_mapping_policy, requested_side, order_type,
  requested_size, requested_size_unit, requested_sizing_mode, resolved_quantity,
  resolved_quantity_unit, limit_price, stop_loss_price, take_profit_price,
  time_in_force, post_only, reduce_only, request_idempotency_key
`;

const attemptColumns = `
  id, intent_id, attempt_number, broker_client_order_id, submitted_quantity,
  transport_state, started_at, response_at, outcome_at, reconciliation_required_at,
  broker_order_id, raw_broker_status, http_status, error_code, error_class, created_at
`;

async function insertIntent(client: PoolClient, intent: DurableGoodTradingOrderIntent): Promise<void> {
  await client.query(
    `INSERT INTO goodtrading_order_intents (${intentColumns}) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
    )`,
    [
      intent.logicalOrderUid, intent.logicalOrderUid, intent.goodTradingAccountUid,
      intent.executionBroker, intent.executionEnvironment, intent.executionMarketInstrument,
      intent.executionMarketVenue, intent.executionMarketType, intent.canonicalBaseAsset,
      intent.canonicalQuoteAsset, intent.canonicalSettlementAsset, intent.canonicalProductType,
      intent.canonicalContractStyle, intent.canonicalExpiry, intent.sourceNativeSymbol,
      intent.sourceNativeInstrumentId, intent.marketMetadataSource, intent.marketMappingPolicy,
      intent.requestedSide, intent.orderType, intent.requestedSize, intent.requestedSizeUnit,
      intent.requestedSizingMode, intent.resolvedQuantity, intent.resolvedQuantityUnit,
      intent.limitPrice, intent.stopLossPrice, intent.takeProfitPrice, intent.timeInForce,
      intent.postOnly, intent.reduceOnly, intent.requestIdempotencyKey,
    ],
  );
}

async function insertAttempt(client: PoolClient, attempt: DurableSubmissionAttempt): Promise<void> {
  await client.query(
    `INSERT INTO goodtrading_order_submission_attempts (${attemptColumns}) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
    )`,
    [
      attempt.attemptId, attempt.intentId, attempt.attemptNumber, attempt.brokerClientOrderId,
      attempt.submittedQuantity, attempt.transportState, attempt.startedAt, attempt.responseAt,
      attempt.outcomeAt, attempt.reconciliationRequiredAt, attempt.brokerOrderId,
      attempt.rawBrokerStatus, attempt.httpStatus, attempt.errorCode, attempt.errorClass,
      new Date(),
    ],
  );
}

export async function createIntentWithInitialAttempt(
  input: CreateDurableIntentWithInitialAttemptInput,
): Promise<CreatedDurableIntentWithAttempt> {
  const intent = createDurableGoodTradingOrderIntent(input.intent);
  const attempt = createDurableSubmissionAttempt(input.attempt);
  if (attempt.intentId !== intent.logicalOrderUid) throw new Error("attempt intentId must match logicalOrderUid");
  if (attempt.attemptNumber !== 1 || attempt.transportState !== "PERSISTED") throw new Error("initial attempt must be PERSISTED attempt 1");
  const client = await requirePool().connect();
  try {
    await client.query("BEGIN");
    await insertIntent(client, intent);
    await insertAttempt(client, attempt);
    await client.query("COMMIT");
    return { intent, attempt };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getIntentByLogicalOrderUid(logicalOrderUid: string): Promise<DurableGoodTradingOrderIntent | null> {
  const result = await requirePool().query(`SELECT ${intentColumns} FROM goodtrading_order_intents WHERE logical_order_uid = $1`, [logicalOrderUid]);
  return result.rows[0] ? mapIntent(result.rows[0] as Record<string, unknown>) : null;
}

export async function getIntentByRequestIdempotencyKey(accountUid: string, key: string): Promise<DurableGoodTradingOrderIntent | null> {
  const result = await requirePool().query(`SELECT ${intentColumns} FROM goodtrading_order_intents WHERE goodtrading_account_uid = $1 AND request_idempotency_key = $2`, [accountUid, key]);
  return result.rows[0] ? mapIntent(result.rows[0] as Record<string, unknown>) : null;
}

export async function getAttemptByBrokerClientOrderId(brokerClientOrderId: string): Promise<DurableSubmissionAttempt | null> {
  const result = await requirePool().query(`SELECT ${attemptColumns} FROM goodtrading_order_submission_attempts WHERE broker_client_order_id = $1`, [brokerClientOrderId]);
  return result.rows[0] ? mapAttempt(result.rows[0] as Record<string, unknown>) : null;
}

export async function listAttemptsForIntent(intentId: string): Promise<DurableSubmissionAttempt[]> {
  const result = await requirePool().query(`SELECT ${attemptColumns} FROM goodtrading_order_submission_attempts WHERE intent_id = $1 ORDER BY attempt_number ASC`, [intentId]);
  return result.rows.map((row) => mapAttempt(row as Record<string, unknown>));
}

export async function appendSubmissionAttempt(input: DurableSubmissionAttemptInput): Promise<DurableSubmissionAttempt> {
  const attempt = createDurableSubmissionAttempt(input);
  if (attempt.attemptNumber < 2) throw new Error("appended attemptNumber must be >= 2");
  await requirePool().query(
    `INSERT INTO goodtrading_order_submission_attempts (${attemptColumns}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [attempt.attemptId, attempt.intentId, attempt.attemptNumber, attempt.brokerClientOrderId, attempt.submittedQuantity, attempt.transportState, attempt.startedAt, attempt.responseAt, attempt.outcomeAt, attempt.reconciliationRequiredAt, attempt.brokerOrderId, attempt.rawBrokerStatus, attempt.httpStatus, attempt.errorCode, attempt.errorClass, new Date()],
  );
  return attempt;
}

export async function markSubmissionStarted(intentId: string): Promise<DurableSubmissionAttempt> {
  const database = requirePool();
  const result = await database.query(
    `UPDATE goodtrading_order_submission_attempts
        SET transport_state = 'SUBMISSION_STARTED', started_at = now()
      WHERE intent_id = $1 AND attempt_number = 1 AND transport_state = 'PERSISTED'
      RETURNING ${attemptColumns}`,
    [intentId],
  );
  if (result.rowCount !== 1) throw new Error("SUBMISSION_STARTED_TRANSITION_REJECTED");
  return mapAttempt(result.rows[0] as Record<string, unknown>);
}

export type SubmissionResponseEvidence = Readonly<{
  brokerOrderId?: string | null;
  rawBrokerStatus?: string | null;
  httpStatus?: number | null;
}>;

export type SubmissionUnknownEvidence = Readonly<{
  errorCode: string;
  errorClass: string;
  rawBrokerStatus?: string | null;
  httpStatus?: number | null;
}>;

function unknownEvidenceValues(evidence: SubmissionUnknownEvidence) {
  return [
    evidence.rawBrokerStatus ?? null,
    evidence.httpStatus ?? null,
    evidence.errorCode,
    evidence.errorClass,
  ];
}

export async function markSubmissionResponseObserved(
  intentId: string,
  evidence: SubmissionResponseEvidence,
): Promise<DurableSubmissionAttempt> {
  const result = await requirePool().query(
    `UPDATE goodtrading_order_submission_attempts
        SET transport_state = 'SUBMISSION_RESPONSE_OBSERVED', response_at = now(),
            broker_order_id = $2, raw_broker_status = $3, http_status = $4,
            error_code = NULL, error_class = NULL
      WHERE intent_id = $1 AND attempt_number = 1 AND transport_state = 'SUBMISSION_STARTED'
      RETURNING ${attemptColumns}`,
    [intentId, evidence.brokerOrderId ?? null, evidence.rawBrokerStatus ?? null, evidence.httpStatus ?? null],
  );
  if (result.rowCount !== 1) throw new Error("SUBMISSION_RESPONSE_OBSERVED_TRANSITION_REJECTED");
  return mapAttempt(result.rows[0] as Record<string, unknown>);
}

export async function markUnknownSubmissionOutcome(
  intentId: string,
  evidence: SubmissionUnknownEvidence,
): Promise<DurableSubmissionAttempt> {
  const result = await requirePool().query(
    `UPDATE goodtrading_order_submission_attempts
        SET transport_state = 'UNKNOWN_SUBMISSION_OUTCOME', outcome_at = now(),
            raw_broker_status = $2, http_status = $3, error_code = $4, error_class = $5
      WHERE intent_id = $1 AND attempt_number = 1 AND transport_state = 'SUBMISSION_STARTED'
      RETURNING ${attemptColumns}`,
    [intentId, ...unknownEvidenceValues(evidence)],
  );
  if (result.rowCount !== 1) throw new Error("UNKNOWN_SUBMISSION_OUTCOME_TRANSITION_REJECTED");
  return mapAttempt(result.rows[0] as Record<string, unknown>);
}

export async function markReconciliationRequired(
  intentId: string,
): Promise<DurableSubmissionAttempt> {
  const result = await requirePool().query(
    `UPDATE goodtrading_order_submission_attempts
        SET transport_state = 'RECONCILIATION_REQUIRED', reconciliation_required_at = now()
      WHERE intent_id = $1 AND attempt_number = 1 AND transport_state = 'UNKNOWN_SUBMISSION_OUTCOME'
      RETURNING ${attemptColumns}`,
    [intentId],
  );
  if (result.rowCount !== 1) throw new Error("RECONCILIATION_REQUIRED_TRANSITION_REJECTED");
  return mapAttempt(result.rows[0] as Record<string, unknown>);
}
