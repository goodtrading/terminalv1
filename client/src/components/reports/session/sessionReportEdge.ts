export type EdgeInference = {
  bestEdge: string;
  bestEdgeCondition: string | null;
  alternativeEdge: string | null;
};

export function inferSessionEdge(input: {
  sweepActive: boolean;
  absorptionBid: boolean;
  vacuumActive: boolean;
  spot: number | null;
  decisionPrice: number | null;
  activeMagnetPrice: number | null;
  testingFlip: boolean;
}): EdgeInference {
  const {
    sweepActive,
    absorptionBid,
    vacuumActive,
    spot,
    decisionPrice,
    activeMagnetPrice,
    testingFlip,
  } = input;

  if (sweepActive && absorptionBid) {
    return {
      bestEdge: "Sweep + Absorption",
      bestEdgeCondition: "Requires follow-through after passive absorption.",
      alternativeEdge: "Flip Rejection / Rotation",
    };
  }

  if (vacuumActive && testingFlip) {
    return {
      bestEdge: "Vacuum Repricing",
      bestEdgeCondition: "Requires acceptance above local flip.",
      alternativeEdge: "Flip Rejection / Rotation",
    };
  }

  if (vacuumActive) {
    return {
      bestEdge: "Vacuum Repricing",
      bestEdgeCondition: "Requires liquidity refill before continuation.",
      alternativeEdge: "Flip Rejection / Rotation",
    };
  }

  if (testingFlip && decisionPrice != null) {
    return {
      bestEdge: "Gamma Flip Reaction",
      bestEdgeCondition: "Requires acceptance above local flip.",
      alternativeEdge: "Flip Rejection / Rotation",
    };
  }

  if (
    spot != null &&
    activeMagnetPrice != null &&
    Math.abs(spot - activeMagnetPrice) / spot <= 0.005
  ) {
    return {
      bestEdge: "Magnet Continuation",
      bestEdgeCondition: "Only relevant if flip rejection confirms.",
      alternativeEdge: "Flip Rejection / Rotation",
    };
  }

  if (testingFlip) {
    return {
      bestEdge: "Flip Rejection / Rotation",
      bestEdgeCondition: "Requires rejection confirmation",
      alternativeEdge: null,
    };
  }

  return {
    bestEdge: "No Clear Edge",
    bestEdgeCondition: null,
    alternativeEdge: null,
  };
}
