import type { MarketSourceCapability } from "@shared/goodTradingAiMarket";
import type { LiveMarketSourceAdapter } from "./adapterTypes";
import { gammaLiveAdapter } from "./gammaAdapter";
import { orderFlowLiveAdapter } from "./orderFlowAdapter";
import { domHealthLiveAdapter, liquidityLiveAdapter } from "./liquidityAdapter";
import {
  footprintUnavailableAdapter,
  openInterestLiveAdapter,
  structureUnavailableAdapter,
} from "./oiStructureFootprintAdapters";
import { auditRailwayTelemetryTopology } from "../telemetry/railwayAudit";

export const REGISTERED_LIVE_ADAPTERS: readonly LiveMarketSourceAdapter[] = [
  gammaLiveAdapter,
  orderFlowLiveAdapter,
  liquidityLiveAdapter,
  domHealthLiveAdapter,
  openInterestLiveAdapter,
  footprintUnavailableAdapter,
  structureUnavailableAdapter,
];

export function getMarketSourceCapabilities(): MarketSourceCapability[] {
  const audit = auditRailwayTelemetryTopology();
  const base = REGISTERED_LIVE_ADAPTERS.map((a) => a.capability);
  const telemetryExtras: MarketSourceCapability[] = [
    {
      sourceId: "client_telemetry_order_flow",
      lens: "orderFlow",
      availability: "Partial",
      serverSide: true,
      readOnly: true,
      notes:
        "implementationStatus:ready (CVD/delta real selectors). sessionStatus: ephemeral cache. mentorEligible:false.",
      bridgeNeeded: false,
      implementationStatus: "ready",
      sessionStatus: "unknown",
      repositorySafety: audit.repositorySafety,
      mentorEligible: false,
    },
    {
      sourceId: "client_telemetry_footprint",
      lens: "footprint",
      availability: "Partial",
      serverSide: true,
      readOnly: true,
      notes:
        "implementationStatus:partial (stacked/POC). absorption/exhaustion UNAVAILABLE. mentorEligible:false.",
      bridgeNeeded: false,
      implementationStatus: "partial",
      sessionStatus: "unknown",
      repositorySafety: audit.repositorySafety,
      mentorEligible: false,
    },
    {
      sourceId: "client_telemetry_lifecycle",
      lens: "liquidity",
      availability: "Partial",
      serverSide: true,
      readOnly: true,
      notes:
        "implementationStatus:partial (spoofingHypothesis DERIVED). mentorEligible:false always.",
      bridgeNeeded: false,
      implementationStatus: "partial",
      sessionStatus: "unknown",
      repositorySafety: audit.repositorySafety,
      mentorEligible: false,
    },
  ];
  return [...base, ...telemetryExtras];
}

export function getLiveAdapters(): readonly LiveMarketSourceAdapter[] {
  return REGISTERED_LIVE_ADAPTERS;
}
