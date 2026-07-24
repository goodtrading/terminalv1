/**
 * AI-8.1.1 — Postgres DecisionContextRepository.
 * Transactions, unique traderActionEventId, immutable context fingerprint.
 */
import { createHash } from "crypto";
import type { TradeDecision } from "@shared/goodTradingAiDecisionContext";
import { tradeDecisionSchema } from "@shared/goodTradingAiDecisionContext";
import type {
  ActiveDecisionKey,
  DecisionContextRepository,
  DecisionPositionSide,
} from "./interfaces";
import {
  ensureDecisionContextPostgresSchema,
  getDecisionContextPool,
} from "./postgresSchema";
import { DECISION_CONTEXT_STORE_CAP, DECISION_CONTEXT_TIMELINE_CAP } from "./flags";

export function fingerprintDecisionContext(context: TradeDecision["context"]): string {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

export function activeKeyString(key: ActiveDecisionKey): string {
  return [
    key.userId,
    key.accountId,
    key.symbol.toUpperCase(),
    key.positionSide,
    key.accountMode,
  ].join(":");
}

function positionSideOf(d: TradeDecision): DecisionPositionSide {
  const raw = (d as TradeDecision & { positionSide?: string }).positionSide;
  if (raw === "long" || raw === "short") return raw;
  return "unknown";
}

function assertContextFrozen(prev: TradeDecision, next: TradeDecision): void {
  if (JSON.stringify(prev.context) !== JSON.stringify(next.context)) {
    throw new Error("DECISION_CONTEXT_IMMUTABLE_VIOLATION");
  }
}

function parseDecision(row: { payload: unknown }): TradeDecision {
  const parsed = tradeDecisionSchema.safeParse(row.payload);
  if (!parsed.success) {
    throw new Error("DECISION_PAYLOAD_INVALID");
  }
  return structuredClone(parsed.data);
}

export class PostgresDecisionContextRepository implements DecisionContextRepository {
  async get(decisionId: string): Promise<TradeDecision | null> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    const res = await pool.query(
      `SELECT payload FROM gt_ai_trade_decisions WHERE decision_id = $1`,
      [decisionId],
    );
    if (!res.rows[0]) return null;
    return parseDecision(res.rows[0]);
  }

  async getActive(key: ActiveDecisionKey): Promise<TradeDecision | null> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    const res = await pool.query(
      `SELECT d.payload FROM gt_ai_decision_active_index a
       JOIN gt_ai_trade_decisions d ON d.decision_id = a.decision_id
       WHERE a.active_key = $1`,
      [activeKeyString(key)],
    );
    if (!res.rows[0]) return null;
    return parseDecision(res.rows[0]);
  }

  async findByActionEvent(traderActionEventId: string): Promise<TradeDecision | null> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    const res = await pool.query(
      `SELECT d.payload FROM gt_ai_decision_context_event_dedup e
       JOIN gt_ai_trade_decisions d ON d.decision_id = e.decision_id
       WHERE e.trader_action_event_id = $1`,
      [traderActionEventId],
    );
    if (!res.rows[0]) return null;
    return parseDecision(res.rows[0]);
  }

  async listForUser(userId: number, limit = 50): Promise<TradeDecision[]> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    const n = Math.max(1, Math.min(DECISION_CONTEXT_STORE_CAP, limit));
    const res = await pool.query(
      `SELECT payload FROM gt_ai_trade_decisions
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT $2`,
      [userId, n],
    );
    return res.rows.map((r: { payload: unknown }) => parseDecision(r));
  }

  async listForAccount(
    userId: number,
    accountId: string,
    limit = 50,
  ): Promise<TradeDecision[]> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    const n = Math.max(1, Math.min(DECISION_CONTEXT_STORE_CAP, limit));
    const res = await pool.query(
      `SELECT payload FROM gt_ai_trade_decisions
       WHERE user_id = $1 AND account_id = $2
       ORDER BY updated_at DESC
       LIMIT $3`,
      [userId, accountId, n],
    );
    return res.rows.map((r: { payload: unknown }) => parseDecision(r));
  }

  async tryClaimActionEvent(
    traderActionEventId: string,
    decisionId: string,
  ): Promise<boolean> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    const res = await pool.query(
      `INSERT INTO gt_ai_decision_context_event_dedup
        (trader_action_event_id, decision_id)
       VALUES ($1, $2)
       ON CONFLICT (trader_action_event_id) DO NOTHING
       RETURNING trader_action_event_id`,
      [traderActionEventId, decisionId],
    );
    return Boolean(res.rows[0]);
  }

  async create(decision: TradeDecision): Promise<TradeDecision> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    if (decision.timeline.length > DECISION_CONTEXT_TIMELINE_CAP) {
      throw new Error("DECISION_TIMELINE_CAP_EXCEEDED");
    }
    const fp = fingerprintDecisionContext(decision.context);
    const side = positionSideOf(decision);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Parent row first — dedup has FK → gt_ai_trade_decisions(decision_id).
      // Claim remains transactional: on conflict we ROLLBACK the whole unit.
      await client.query(
        `INSERT INTO gt_ai_trade_decisions
          (decision_id, user_id, account_id, symbol, position_side, account_mode,
           status, created_at, updated_at, closed_at, payload, context_fingerprint,
           mentor_eligible, brain_mutate, learning, auto_apply)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz,
                 $11::jsonb,$12,false,false,false,false)`,
        [
          decision.decisionId,
          decision.userId,
          decision.accountId,
          decision.symbol,
          side,
          decision.accountMode,
          decision.status,
          decision.createdAt,
          decision.updatedAt,
          decision.closedAt,
          JSON.stringify(decision),
          fp,
        ],
      );
      const claim = await client.query(
        `INSERT INTO gt_ai_decision_context_event_dedup
          (trader_action_event_id, decision_id)
         VALUES ($1, $2)
         ON CONFLICT (trader_action_event_id) DO NOTHING
         RETURNING trader_action_event_id`,
        [decision.context.traderActionEventId, decision.decisionId],
      );
      if (!claim.rows[0]) {
        await client.query("ROLLBACK");
        const existing = await this.findByActionEvent(
          decision.context.traderActionEventId,
        );
        if (existing) return existing;
        throw new Error("DECISION_EVENT_DEDUP_CONFLICT");
      }
      await client.query(
        `INSERT INTO gt_ai_decision_contexts
          (decision_id, trader_action_event_id, context, context_fingerprint, created_at)
         VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz)`,
        [
          decision.decisionId,
          decision.context.traderActionEventId,
          JSON.stringify(decision.context),
          fp,
          decision.createdAt,
        ],
      );
      await client.query(
        `INSERT INTO gt_ai_decision_journals (decision_id, journal, updated_at)
         VALUES ($1, $2::jsonb, $3::timestamptz)`,
        [decision.decisionId, JSON.stringify(decision.journal), decision.updatedAt],
      );
      for (const ev of decision.timeline) {
        await client.query(
          `INSERT INTO gt_ai_decision_timeline_events
            (event_id, decision_id, trader_action_event_id, type, at, payload)
           VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb)
           ON CONFLICT (trader_action_event_id) DO NOTHING`,
          [
            ev.eventId,
            decision.decisionId,
            ev.traderActionEventId,
            ev.type,
            ev.at,
            JSON.stringify(ev),
          ],
        );
      }
      if (decision.status !== "CLOSED") {
        await client.query(
          `INSERT INTO gt_ai_decision_active_index
            (active_key, decision_id, user_id, updated_at)
           VALUES ($1, $2, $3, $4::timestamptz)
           ON CONFLICT (active_key) DO UPDATE SET
             decision_id = EXCLUDED.decision_id,
             updated_at = EXCLUDED.updated_at`,
          [
            activeKeyString({
              userId: decision.userId,
              accountId: decision.accountId,
              symbol: decision.symbol,
              positionSide: side,
              accountMode: decision.accountMode,
            }),
            decision.decisionId,
            decision.userId,
            decision.updatedAt,
          ],
        );
      }
      await client.query("COMMIT");
      return structuredClone(decision);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async updateLifecycle(next: TradeDecision): Promise<TradeDecision> {
    await ensureDecisionContextPostgresSchema();
    const pool = getDecisionContextPool();
    if (!pool) throw new Error("DATABASE_UNAVAILABLE");
    if (next.timeline.length > DECISION_CONTEXT_TIMELINE_CAP) {
      throw new Error("DECISION_TIMELINE_CAP_EXCEEDED");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const prevRes = await client.query(
        `SELECT payload FROM gt_ai_trade_decisions WHERE decision_id = $1 FOR UPDATE`,
        [next.decisionId],
      );
      if (!prevRes.rows[0]) throw new Error("DECISION_NOT_FOUND");
      const prev = parseDecision(prevRes.rows[0]);
      assertContextFrozen(prev, next);
      const fp = fingerprintDecisionContext(next.context);
      const side = positionSideOf(next);
      await client.query(
        `UPDATE gt_ai_trade_decisions SET
           status = $2,
           updated_at = $3::timestamptz,
           closed_at = $4::timestamptz,
           payload = $5::jsonb,
           position_side = $6
         WHERE decision_id = $1 AND context_fingerprint = $7`,
        [
          next.decisionId,
          next.status,
          next.updatedAt,
          next.closedAt,
          JSON.stringify(next),
          side,
          fp,
        ],
      );
      await client.query(
        `UPDATE gt_ai_decision_journals SET journal = $2::jsonb, updated_at = $3::timestamptz
         WHERE decision_id = $1`,
        [next.decisionId, JSON.stringify(next.journal), next.updatedAt],
      );
      for (const ev of next.timeline) {
        await client.query(
          `INSERT INTO gt_ai_decision_timeline_events
            (event_id, decision_id, trader_action_event_id, type, at, payload)
           VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb)
           ON CONFLICT (trader_action_event_id) DO NOTHING`,
          [
            ev.eventId,
            next.decisionId,
            ev.traderActionEventId,
            ev.type,
            ev.at,
            JSON.stringify(ev),
          ],
        );
        await client.query(
          `INSERT INTO gt_ai_decision_context_event_dedup
            (trader_action_event_id, decision_id)
           VALUES ($1, $2)
           ON CONFLICT (trader_action_event_id) DO NOTHING`,
          [ev.traderActionEventId, next.decisionId],
        );
      }
      const key = activeKeyString({
        userId: next.userId,
        accountId: next.accountId,
        symbol: next.symbol,
        positionSide: side,
        accountMode: next.accountMode,
      });
      if (next.status === "CLOSED") {
        await client.query(
          `DELETE FROM gt_ai_decision_active_index
           WHERE active_key = $1 AND decision_id = $2`,
          [key, next.decisionId],
        );
      } else {
        await client.query(
          `INSERT INTO gt_ai_decision_active_index
            (active_key, decision_id, user_id, updated_at)
           VALUES ($1, $2, $3, $4::timestamptz)
           ON CONFLICT (active_key) DO UPDATE SET
             decision_id = EXCLUDED.decision_id,
             updated_at = EXCLUDED.updated_at`,
          [key, next.decisionId, next.userId, next.updatedAt],
        );
      }
      await client.query("COMMIT");
      return structuredClone(next);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }
}
