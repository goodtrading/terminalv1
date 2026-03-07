# QUANTUM_SYS — Institutional Crypto Derivatives Terminal

## Overview
High-density institutional crypto derivatives trading dashboard with real BTC market data and a full options analytics engine.

## Architecture
- **Frontend**: React + Vite + TailwindCSS v4 + lightweight-charts v5.1.0, wouter routing
- **Backend**: Express server on port 5000, PostgreSQL + Drizzle ORM
- **Data Sources**: Coinbase (primary ticker), Deribit CSV ingestion for options data
- **Binance/Bybit**: Geo-blocked, failover to Coinbase

## Key Files
- `server/deribit-gateway.ts` — Options analytics engine (CSV ingestion + all computation engines)
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
12. Volatility Expansion Detector (volExpansionState, expansionDirection, expansionProbability, playbookShiftSuggested, suggestedPlaybook, expansionTriggerZone)

## Terminal State Data Flow
`getTerminalState()` in `terminal-state.ts`:
- Reads DB for market, exposure, positioning, levels, scenarios
- Injects live `tradingPlaybook` and `volatilityExpansionDetector` from DeribitOptionsGateway into `positioning`
- Reads cached ticker from MarketDataGateway
- Returns unified state at `/api/terminal/state`

## Important Notes
- CSV returns 0 valid rows currently — all engines use fallback values
- Liquidation data is stubbed (perp liquidation clusters hardcoded at spot±2%)
- `tickerStatus`: "fresh" if age < 10s
- Tailwind v4: `@utility` only
- lightweight-charts v5.1.0: `chart.addSeries(CandlestickSeries)`
