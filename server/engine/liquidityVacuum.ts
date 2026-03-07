export interface VacuumEvent {
  type: "LIQUIDITY_VACUUM";
  direction: "UP" | "DOWN";
  priceStart: number;
  priceEnd: number;
  strength: number;
  strengthClass: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  timestamp: number;
}

export interface ThinLiquidityZone {
  price: number;
  direction: "UP" | "DOWN";
  thinnessScore: number;
}

export interface VacuumState {
  vacuumRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  activeZones: VacuumEvent[];
  depthRatio: number;
  spreadRatio: number;
  vacuumProximity: number;
  predictiveRisk: "LOW" | "MEDIUM" | "HIGH" | "IMMINENT";
  nearestThinLiquidityZone: number | null;
  nearestThinLiquidityDirection: "UP" | "DOWN" | null;
  nearestThinLiquidityScore: number;
  confirmedVacuumActive: boolean;
}

interface Snapshot {
  totalDepth: number;
  spread: number;
  price: number;
  timestamp: number;
}

interface ZoneDepth {
  price: number;
  depth: number;
}

const ROLLING_WINDOW = 20;
const MAX_ZONES = 3;
const ZONE_TTL_MS = 5 * 60 * 1000;
const DEPTH_COLLAPSE_THRESHOLD = 0.4;
const SPREAD_EXPANSION_THRESHOLD = 2.0;
const DISPLACEMENT_WINDOW = 3;
const DEPTH_WEIGHT = 0.4;
const SPREAD_WEIGHT = 0.3;
const DISPLACEMENT_WEIGHT = 0.3;
const THIN_LIQUIDITY_THRESHOLD = 0.35;
const PROXIMITY_SCAN_RANGE = 0.03;
const PROXIMITY_ZONE_SIZE = 0.005;

const history: Snapshot[] = [];
const activeZones: VacuumEvent[] = [];

function rollingAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function classifyStrength(strength: number): "LOW" | "MEDIUM" | "HIGH" | "EXTREME" {
  if (strength >= 0.75) return "EXTREME";
  if (strength >= 0.5) return "HIGH";
  if (strength >= 0.25) return "MEDIUM";
  return "LOW";
}

function computeZoneDepths(
  orders: { price: number; quantity: number }[],
  spotPrice: number,
  direction: "UP" | "DOWN",
  zoneSize: number,
  scanRange: number,
): ZoneDepth[] {
  const zones: ZoneDepth[] = [];
  const steps = Math.floor(scanRange / zoneSize);

  for (let i = 1; i <= steps; i++) {
    const zoneCenter = direction === "UP"
      ? spotPrice + i * zoneSize * spotPrice
      : spotPrice - i * zoneSize * spotPrice;
    const halfZone = (zoneSize * spotPrice) / 2;
    const low = zoneCenter - halfZone;
    const high = zoneCenter + halfZone;
    const depth = orders
      .filter(o => o.price >= low && o.price <= high)
      .reduce((s, o) => s + o.quantity, 0);
    zones.push({ price: Math.round(zoneCenter), depth });
  }
  return zones;
}

export function processVacuumDetection(
  bids: { price: number; quantity: number }[],
  asks: { price: number; quantity: number }[],
  spotPrice: number
): VacuumState {
  const now = Date.now();

  const range = spotPrice * 0.02;
  const nearBids = bids.filter(b => spotPrice - b.price <= range && b.price < spotPrice);
  const nearAsks = asks.filter(a => a.price - spotPrice <= range && a.price > spotPrice);

  const totalBidDepth = nearBids.reduce((s, b) => s + b.quantity, 0);
  const totalAskDepth = nearAsks.reduce((s, a) => s + a.quantity, 0);
  const totalDepth = totalBidDepth + totalAskDepth;

  const bestBid = bids.length > 0 ? Math.max(...bids.slice(0, 10).map(b => b.price)) : spotPrice * 0.999;
  const bestAsk = asks.length > 0 ? Math.min(...asks.slice(0, 10).map(a => a.price)) : spotPrice * 1.001;
  const spread = bestAsk - bestBid;

  history.push({ totalDepth, spread, price: spotPrice, timestamp: now });
  if (history.length > ROLLING_WINDOW) history.shift();

  const avgDepth = rollingAverage(history.map(h => h.totalDepth));
  const avgSpread = rollingAverage(history.map(h => h.spread));

  const currentDepth = totalDepth;
  const currentSpread = spread;

  const depthCondition = avgDepth > 0 && currentDepth < avgDepth * DEPTH_COLLAPSE_THRESHOLD;
  const spreadCondition = avgSpread > 0 && currentSpread > avgSpread * SPREAD_EXPANSION_THRESHOLD;

  let displacementCondition = false;
  let displacementDirection: "UP" | "DOWN" = "UP";
  let priceVelocity = 0;

  if (history.length >= DISPLACEMENT_WINDOW) {
    const recent = history.slice(-DISPLACEMENT_WINDOW);
    const priceMove = recent[recent.length - 1].price - recent[0].price;
    const displacementThreshold = spotPrice * 0.003;
    priceVelocity = Math.abs(priceMove) / DISPLACEMENT_WINDOW;

    if (Math.abs(priceMove) > displacementThreshold) {
      displacementCondition = true;
      displacementDirection = priceMove > 0 ? "UP" : "DOWN";
    }
  }

  for (let i = activeZones.length - 1; i >= 0; i--) {
    if (now - activeZones[i].timestamp > ZONE_TTL_MS) {
      activeZones.splice(i, 1);
    }
  }

  let confirmedVacuumActive = false;

  if (depthCondition && spreadCondition && displacementCondition) {
    const depthDrop = avgDepth > 0 ? 1 - (currentDepth / avgDepth) : 0;
    const spreadIncrease = avgSpread > 0 ? (currentSpread / avgSpread) - 1 : 0;
    const normalizedVelocity = spotPrice > 0 ? priceVelocity / spotPrice * 1000 : 0;

    const strength = Math.min(1,
      DEPTH_WEIGHT * depthDrop +
      SPREAD_WEIGHT * Math.min(1, spreadIncrease / 3) +
      DISPLACEMENT_WEIGHT * Math.min(1, normalizedVelocity)
    );

    const recentPrices = history.slice(-DISPLACEMENT_WINDOW);
    const priceStart = Math.min(...recentPrices.map(h => h.price));
    const priceEnd = Math.max(...recentPrices.map(h => h.price));

    const tooClose = activeZones.some(z =>
      Math.abs(z.priceStart - priceStart) < spotPrice * 0.005 &&
      Math.abs(z.priceEnd - priceEnd) < spotPrice * 0.005
    );

    if (!tooClose) {
      const roundedStrength = Math.round(strength * 100) / 100;
      const event: VacuumEvent = {
        type: "LIQUIDITY_VACUUM",
        direction: displacementDirection,
        priceStart,
        priceEnd,
        strength: roundedStrength,
        strengthClass: classifyStrength(roundedStrength),
        timestamp: now,
      };
      activeZones.push(event);

      if (activeZones.length > MAX_ZONES) {
        activeZones.sort((a, b) => b.strength - a.strength);
        activeZones.length = MAX_ZONES;
      }
    }

    confirmedVacuumActive = true;
  }

  if (!confirmedVacuumActive && activeZones.length > 0) {
    const freshZones = activeZones.filter(z => now - z.timestamp < 60_000);
    confirmedVacuumActive = freshZones.length > 0;
  }

  const depthRatio = avgDepth > 0 ? Math.round((currentDepth / avgDepth) * 100) / 100 : 1;
  const spreadRatio = avgSpread > 0 ? Math.round((currentSpread / avgSpread) * 100) / 100 : 1;

  const askZoneDepths = computeZoneDepths(asks, spotPrice, "UP", PROXIMITY_ZONE_SIZE, PROXIMITY_SCAN_RANGE);
  const bidZoneDepths = computeZoneDepths(bids, spotPrice, "DOWN", PROXIMITY_ZONE_SIZE, PROXIMITY_SCAN_RANGE);

  const allZoneDepths = [...askZoneDepths, ...bidZoneDepths];
  const avgZoneDepth = allZoneDepths.length > 0
    ? allZoneDepths.reduce((s, z) => s + z.depth, 0) / allZoneDepths.length
    : 0;

  let nearestThinZone: ThinLiquidityZone | null = null;
  let bestThinnessScore = 0;

  for (const z of askZoneDepths) {
    if (avgZoneDepth > 0 && z.depth < avgZoneDepth * THIN_LIQUIDITY_THRESHOLD) {
      const score = Math.round((1 - z.depth / avgZoneDepth) * 100);
      if (score > bestThinnessScore) {
        bestThinnessScore = score;
        nearestThinZone = { price: z.price, direction: "UP", thinnessScore: score };
      }
    }
  }
  for (const z of bidZoneDepths) {
    if (avgZoneDepth > 0 && z.depth < avgZoneDepth * THIN_LIQUIDITY_THRESHOLD) {
      const score = Math.round((1 - z.depth / avgZoneDepth) * 100);
      if (!nearestThinZone || Math.abs(z.price - spotPrice) < Math.abs(nearestThinZone.price - spotPrice)) {
        if (score > bestThinnessScore * 0.7) {
          bestThinnessScore = score;
          nearestThinZone = { price: z.price, direction: "DOWN", thinnessScore: score };
        }
      }
    }
  }

  let proximityScore = 0;

  const depthComponent = depthRatio < 1 ? Math.round((1 - depthRatio) * 30) : 0;
  proximityScore += depthComponent;

  const spreadComponent = spreadRatio > 1 ? Math.min(25, Math.round((spreadRatio - 1) * 25)) : 0;
  proximityScore += spreadComponent;

  if (nearestThinZone) {
    const distanceFraction = Math.abs(nearestThinZone.price - spotPrice) / (spotPrice * PROXIMITY_SCAN_RANGE);
    const closenessComponent = Math.round((1 - distanceFraction) * 25 * (nearestThinZone.thinnessScore / 100));
    proximityScore += closenessComponent;
  }

  if (history.length >= 3) {
    const recentVelocity = Math.abs(history[history.length - 1].price - history[history.length - 3].price) / spotPrice;
    const velocityComponent = Math.min(20, Math.round(recentVelocity * 10000));
    proximityScore += velocityComponent;
  }

  const vacuumProximity = Math.min(100, Math.max(0, proximityScore));

  const predictiveRisk: "LOW" | "MEDIUM" | "HIGH" | "IMMINENT" =
    vacuumProximity >= 76 ? "IMMINENT" :
    vacuumProximity >= 51 ? "HIGH" :
    vacuumProximity >= 26 ? "MEDIUM" : "LOW";

  let riskScore = 0;
  if (depthRatio < 0.6) riskScore += 2;
  else if (depthRatio < 0.8) riskScore += 1;
  if (spreadRatio > 1.5) riskScore += 2;
  else if (spreadRatio > 1.2) riskScore += 1;
  if (activeZones.length > 0) riskScore += 2;
  if (activeZones.some(z => z.strength > 0.7)) riskScore += 1;
  if (predictiveRisk === "IMMINENT") riskScore += 1;

  const vacuumRisk: "LOW" | "MEDIUM" | "HIGH" | "EXTREME" =
    riskScore >= 6 ? "EXTREME" : riskScore >= 4 ? "HIGH" : riskScore >= 2 ? "MEDIUM" : "LOW";

  return {
    vacuumRisk,
    activeZones: [...activeZones],
    depthRatio,
    spreadRatio,
    vacuumProximity,
    predictiveRisk,
    nearestThinLiquidityZone: nearestThinZone?.price ?? null,
    nearestThinLiquidityDirection: nearestThinZone?.direction ?? null,
    nearestThinLiquidityScore: nearestThinZone?.thinnessScore ?? 0,
    confirmedVacuumActive,
  };
}
