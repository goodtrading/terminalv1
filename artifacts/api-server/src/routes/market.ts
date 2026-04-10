import { Router, type IRouter } from "express";
import { getMarketState, getStoreTrace } from "../lib/store";

const router: IRouter = Router();

/**
 * GET /api/market/state
 *
 * Returns the current market intelligence state.
 * No cache — always returns the live in-memory store value.
 *
 * Optional query param: ?trace=1
 * When present, includes __trace block with provenance metadata.
 * Remove in production if you want a leaner response.
 */
router.get("/market/state", (req, res) => {
  const requestedAt = new Date().toISOString();
  const state = getMarketState();

  const payload: Record<string, unknown> = { ...state };

  // Traceability block — only included when ?trace=1
  if (req.query["trace"] === "1") {
    const trace = getStoreTrace();
    const stateAge = Date.now() - new Date(state.lastUpdate).getTime();

    payload["__trace"] = {
      requestedAt,
      stateSource:       trace.stateSource,
      stateLastUpdated:  state.lastUpdate,
      stateAgeMs:        stateAge,
      lastTerminalPush:  trace.lastPushAt ?? "no_push_this_session",
      terminalPushCount: trace.pushCount,
      serverBootTime:    trace.bootTime,
      // Field-level provenance
      fieldOrigins: {
        bias:          { field: "bias",          source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        gamma:         { field: "gamma",         source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        zone:          { field: "zone",          source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        scenario:      { field: "scenario",      source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        setup:         { field: "setup",         source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        probability:   { field: "probability",   source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        gammaLevel:    { field: "gammaLevel",    source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        netGamma:      { field: "netGamma",      source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        flipPoint:     { field: "flipPoint",     source: trace.stateSource, fn: "updateMarketState → store.marketState" },
        biasStrength:  { field: "biasStrength",  source: trace.stateSource, fn: "updateMarketState → store.marketState" },
      },
    };
  }

  res.setHeader("Cache-Control", "no-store");
  res.json(payload);
});

export default router;
