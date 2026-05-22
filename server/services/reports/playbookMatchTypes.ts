export type ExecutionPlaybookId =
  | "sweep_absorption"
  | "gamma_magnet_continuation"
  | "flip_rejection"
  | "liquidity_vacuum"
  | "failed_auction"
  | "absorption_scalp"
  | "no_match";

export interface ExecutionPlaybookMatch {
  id: ExecutionPlaybookId;
  name: string;
  confidence: number;
  status: "matched" | "partial" | "no_match";
  directionBias?: "long" | "short" | "neutral" | "unknown";
  reasons: string[];
  warnings: string[];
  invalidations: string[];
  tags: string[];
}

export interface PlaybookMatchResult {
  primary: ExecutionPlaybookMatch;
  candidates: ExecutionPlaybookMatch[];
  summary: string;
}
