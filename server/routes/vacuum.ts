import { Router } from "express";
import { liquidityVacuumEngine, VacuumEngineInput } from "../lib/liquidityVacuumEngine";

const router = Router();

// Get vacuum analysis
router.get("/vacuum", async (req, res) => {
  try {
    // Get current market data
    const [marketState, positioning, heatmapData, orderbookData] = await Promise.all([
      fetchMarketState(),
      fetchOptionsPositioning(),
      fetchHeatmapData(),
      fetchOrderbookData()
    ]);

    if (!orderbookData || !marketState) {
      return res.status(503).json({
        error: "Insufficient market data for vacuum analysis",
        vacuumRisk: "LOW",
        vacuumDirection: "NEUTRAL",
        confirmedVacuumActive: false
      });
    }

    // Prepare input for vacuum engine
    const input: VacuumEngineInput = {
      spotPrice: orderbookData.spot,
      bids: orderbookData.bids,
      asks: orderbookData.asks,
      heatmapSummary: heatmapData?.summary,
      liquidityHeatZones: heatmapData?.zones,
      nearestBookClusters: positioning ? {
        above: [positioning.callWall],
        below: [positioning.putWall]
      } : undefined,
      spread: orderbookData.spread,
      liquiditySweepRisk: marketState.liquiditySweepDetector,
      dealerHedgingFlow: marketState.dealerHedgingFlow,
      volatility: marketState.volatility
    };

    // Run vacuum analysis
    const result = liquidityVacuumEngine.analyze(input);

    res.json(result);
  } catch (error) {
    console.error("Vacuum analysis error:", error);
    res.status(500).json({
      error: "Failed to analyze vacuum conditions",
      vacuumRisk: "LOW",
      vacuumDirection: "NEUTRAL",
      confirmedVacuumActive: false
    });
  }
});

// Helper functions to fetch market data
async function fetchMarketState() {
  try {
    const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3000'}/api/market-state`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch market state:", error);
    return null;
  }
}

async function fetchOptionsPositioning() {
  try {
    const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3000'}/api/options-positioning`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch options positioning:", error);
    return null;
  }
}

async function fetchHeatmapData() {
  try {
    const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3000'}/api/liquidity-heatmap`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch heatmap data:", error);
    return null;
  }
}

async function fetchOrderbookData() {
  try {
    const response = await fetch(`${process.env.API_BASE_URL || 'http://localhost:3000'}/api/orderbook/raw`);
    if (!response.ok) return null;
    const data = await response.json();
    
    // Transform orderbook data to expected format
    return {
      spot: data.spot || (data.bids[0]?.price + data.asks[0]?.price) / 2,
      bids: data.bids.map((bid: any) => ({ price: bid[0], size: bid[1] })),
      asks: data.asks.map((ask: any) => ({ price: ask[0], size: ask[1] })),
      spread: data.asks[0]?.[0] - data.bids[0]?.[0]
    };
  } catch (error) {
    console.error("Failed to fetch orderbook data:", error);
    return null;
  }
}

export default router;
