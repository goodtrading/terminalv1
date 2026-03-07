# QUANTUM_SYS — Institutional Crypto Derivatives Terminal

## Overview
High-density institutional crypto derivatives trading dashboard with real BTC market data and a full options analytics engine.

## Architecture
- **Frontend**: React + Vite + TailwindCSS v4 + lightweight-charts v5.1.0, wouter routing
- **Backend**: Express server on port 5000, PostgreSQL + Drizzle ORM
- **Data Sources**: Coinbase (primary ticker), Deribit Live API (primary options), CSV fallback
- **Binance/Bybit**: Geo-blocked, failover to Coinbase

## Options Data Ingestion
- **Primary**: Live Deribit API via `get_book_summary_by_currency?currency=BTC&kind=option`
- **Fallback**: CSV files in `attached_assets/` directory
- **Method**: `DeribitOptionsGateway.ingestOptions()` tries live first, falls back to CSV
- **Cache**: 30-second TTL on live API responses
- **Greeks**: Computed from instrument data (gamma, vanna, charm) using Black-Scholes approximation with Deribit mark IV
- **Source tracking**: `source: "LIVE_DERIBIT" | "CSV_FALLBACK"` in summary and terminal state

## Key Files
- `server/deribit-gateway.ts` — Options analytics engine (live API + CSV ingestion + all computation engines)
- `server/terminal-state.ts` — Unified terminal state aggregator
- `server/market-gateway.ts` — Market data (ticker) provider
- `server/routes.ts` — API routes
- `server/storage.ts` — DB storage interface
- `client/src/hooks/useTerminalState.ts` — Frontend terminal state hook
- `client/src/components/terminal/` — All terminal UI panels
- `shared/schema.ts` — Drizzle schema + Zod types

## Analytics Engines (in deribit-gateway.ts getSummary)
1. GEX / Gamma Flip / Call Wall / Put Wall
2. Gamma Curve + Magnets + Short Gamma Zones
3. Gamma Gradient Engine (slope, acceleration, cliffs, wall strength)
4. Advanced Hedging Dynamics (dealer state, hedge direction, vol regime, flow score)
5. Dealer Reaction Map (reaction zones)
6. Delta Hedging Speed Engine (hedging speed/stress, cascade risk, pinning strength, flow urgency)
7. Backtesting Engine
8. Liquidation Confluence Engine
9. Market Regime Engine (dealerRegime, liquidityPressure, volatilityState, tradeBias, regimeConfidence)
10. Dealer Trap Engine (trapZones, currentTrapRisk, activeTrapContext)
11. Trading Playbook Engine (currentPlaybook, tradeZones, invalidationLevel, regimeShiftTrigger)
12. Gamma Curve Engine (gammaSlope, gammaCliffs, dealerSensitivity, gammaRegimeBand)
13. Volatility Expansion Detector (volExpansionState, expansionDirection, expansionProbability, playbookShiftSuggested, suggestedPlaybook, expansionTriggerZone)
14. Institutional Bias Engine (institutionalBias, biasConfidence, biasDrivers, biasInvalidation, biasHorizon)
15. Trade Decision Engine (tradeState, tradeDirection, entryCondition, riskLevel, positionSizeSuggestion, executionReason)
16. Liquidity Cascade Engine (cascadeRisk, cascadeDirection, cascadeTrigger, liquidationPocket, cascadeDrivers)
17. Squeeze Probability Engine (squeezeProbability, squeezeDirection, squeezeType, squeezeTrigger, squeezeTarget, squeezeDrivers)
18. Market Mode Engine (marketMode, marketModeConfidence, marketModeReason) — classifies market into GAMMA_PIN, MEAN_REVERSION, VOL_EXPANSION, SQUEEZE_RISK, CASCADE_RISK, or FRAGILE_TRANSITION using scoring system across all engines
19. Dealer Hedging Flow Map (hedgingFlowDirection, hedgingFlowStrength, hedgingAccelerationRisk, hedgingTriggerZone, hedgingFlowSummary) — estimates when dealer hedging forces buying/selling and whether it stabilizes or accelerates price
20. Liquidity Sweep Detector (sweepRisk, sweepDirection, sweepTrigger, sweepTargetZone, sweepSummary) — detects likely liquidity sweeps where price may move into/through visible order book zones with acceleration; computed in terminal-state.ts using heatmap + options engines

## Liquidity Heatmap Engine
- `server/orderbook-gateway.ts` — Live order book gateway + heatmap computation
- **Data Sources**: Binance (geo-blocked), Bybit, Coinbase (primary fallback)
- **Cache**: 15-second TTL on order book data
- **Outputs**: liquidityHeatZones, liquidityConfluenceZones, liquidityPressure, heatmapSummary
- **Confluence**: Combines order book clusters with gamma levels (callWall, putWall, dealerPivot, gammaMagnets, gammaCliffs)
- **API**: `/api/liquidity/heatmap` (standalone) + injected into `positioning.liquidityHeatmap` in terminal state
- **Chart Mode**: HEATMAP — shows bid zones (green), ask zones (red), confluence zones (purple) with legend

## Terminal State Data Flow
`getTerminalState()` in `terminal-state.ts`:
- Reads DB for market, exposure, positioning, levels, scenarios
- Calls `DeribitOptionsGateway.ingestOptions()` (live API primary, CSV fallback)
- Calls `OrderBookGateway.getLiquidityHeatmap()` with gamma data for confluence computation
- Injects `tradingPlaybook`, `volatilityExpansionDetector`, `gammaCurveEngine`, `institutionalBiasEngine`, `tradeDecisionEngine`, `liquidityCascadeEngine`, `squeezeProbabilityEngine`, `marketModeEngine`, `liquidityHeatmap`, and `optionsSource` into `positioning`
- Reads cached ticker from MarketDataGateway
- Returns unified state at `/api/terminal/state`

## Important Notes
- Liquidation data is stubbed (perp liquidation clusters hardcoded at spot±2%)
- `tickerStatus`: "fresh" if age < 10s
- Tailwind v4: `@utility` only
- lightweight-charts v5.1.0: `chart.addSeries(CandlestickSeries)`
- Chart modes: LEVELS, GAMMA, CASCADE, SQUEEZE, HEATMAP
