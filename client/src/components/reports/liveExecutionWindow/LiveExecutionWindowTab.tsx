import * as React from "react";
import { useState, type FormEvent } from "react";
import { ReportBadge } from "../ReportBadge";
import { ReportSection } from "../ReportSection";
import { DesktopEmptyState } from "@/components/desktop/DesktopEmptyState";
import {
  useLiveExecutionWindowReport,
  validateLiveReportInterval,
} from "./useLiveExecutionWindowReport";
import type {
  LiveExecutionFinancialGroup,
  LiveExecutionTimestampPolicy,
} from "./liveExecutionWindowTypes";

const POLICY_LABELS: Record<LiveExecutionTimestampPolicy, string> = {
  PROVIDER_REPORTED_TIMESTAMP: "Provider-reported timestamp",
  GOODTRADING_OBSERVATION_TIME: "GoodTrading observation time",
};

function displayError(code: string): string {
  switch (code) {
    case "LIVE_REPORT_INVALID_REQUEST":
      return "Choose a valid UTC interval and timestamp policy.";
    case "LIVE_REPORT_INTERVAL_TOO_LARGE":
      return "The reporting interval cannot exceed seven days.";
    case "LIVE_REPORT_ACCOUNT_NOT_FOUND":
      return "No GoodTrading account is linked to this user.";
    case "LIVE_REPORT_RESULT_LIMIT_EXCEEDED":
      return "The selected period contains too many executions. Choose a smaller period.";
    case "LIVE_REPORT_QUERY_TIMEOUT":
    case "LIVE_REPORT_REQUEST_DEADLINE":
      return "The report timed out. Try a smaller period.";
    default:
      return "The LIVE report could not be loaded. Try again.";
  }
}

function exact(value: string | null | undefined): string {
  return value ?? "Unavailable";
}

function GroupCard({ group }: { group: LiveExecutionFinancialGroup }) {
  return (
    <ReportSection title={`${group.instrument} · ${group.side}`}>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px] font-mono">
        <span className="text-slate-500">Executions <strong className="text-slate-200">{group.executionCount}</strong></span>
        <span className="text-slate-500">Quantity <strong className="text-slate-200">{exact(group.executedQuantity.value)}</strong></span>
        <span className="text-slate-500 col-span-2">Unit <strong className="text-amber-300">NOT_PERSISTED</strong></span>
        <span className="text-slate-500 col-span-2">Selected-execution VWAP <strong className="text-slate-200">{exact(group.selectedExecutionVwap.value)}</strong></span>
        <span className="text-slate-500 col-span-2">VWAP scale <strong className="text-slate-200">{group.selectedExecutionVwap.outputScale} decimals · truncate toward zero</strong></span>
        <span className="text-slate-500 col-span-2">Mathematical price × quantity <strong className="text-slate-200">{exact(group.weightedPriceNumerator.value)}</strong></span>
      </div>
      <div className="mt-3 border-t border-terminal-border pt-2 text-[10px] font-mono">
        <p className="text-slate-500">Fees by asset</p>
        {group.fees.length === 0 ? <p className="text-slate-400">No known fee amounts</p> : group.fees.map((fee) => (
          <p key={fee.asset} className="text-slate-300">{fee.asset}: {fee.amount} · {fee.availability === "PARTIAL" ? "partial subtotal" : "complete subtotal"}</p>
        ))}
        {group.unavailableFeeExecutionCount > 0 ? (
          <p className="mt-1 text-amber-300">{group.unavailableFeeExecutionCount} execution(s) have unavailable fee evidence; this is not factual zero.</p>
        ) : null}
      </div>
    </ReportSection>
  );
}

export function LiveExecutionWindowTab() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [policy, setPolicy] = useState<LiveExecutionTimestampPolicy | "">("");
  const [formError, setFormError] = useState<string | null>(null);
  const { state, submit } = useLiveExecutionWindowReport();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    if (!policy) {
      setFormError("Select a timestamp policy before requesting a report.");
      return;
    }
    try {
      validateLiveReportInterval(start, end);
    } catch (error) {
      setFormError(error instanceof Error && error.message === "LIVE_REPORT_INTERVAL_TOO_LARGE" ? "The reporting interval cannot exceed seven days." : "Choose a valid UTC interval.");
      return;
    }
    void submit(start, end, policy);
  };

  return (
    <section className="flex flex-col gap-5">
      <ReportSection title="LIVE execution window · read only">
        <form className="grid grid-cols-1 md:grid-cols-4 gap-3" onSubmit={handleSubmit}>
          <label className="text-[10px] font-mono text-slate-500">
            Start · local input converted to UTC
            <input aria-label="Start inclusive" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} className="mt-1 w-full rounded border border-terminal-border bg-terminal-bg px-2 py-2 text-slate-200" />
          </label>
          <label className="text-[10px] font-mono text-slate-500">
            End · local input converted to UTC
            <input aria-label="End exclusive" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)} className="mt-1 w-full rounded border border-terminal-border bg-terminal-bg px-2 py-2 text-slate-200" />
          </label>
          <label className="text-[10px] font-mono text-slate-500">
            Timestamp policy
            <select aria-label="Timestamp policy" value={policy} onChange={(event) => setPolicy(event.target.value as LiveExecutionTimestampPolicy | "")} className="mt-1 w-full rounded border border-terminal-border bg-terminal-bg px-2 py-2 text-slate-200">
              <option value="">Select policy</option>
              <option value="PROVIDER_REPORTED_TIMESTAMP">Provider-reported timestamp</option>
              <option value="GOODTRADING_OBSERVATION_TIME">GoodTrading observation time</option>
            </select>
          </label>
          <button type="submit" disabled={state.status === "loading"} className="self-end rounded border border-terminal-accent/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-white disabled:opacity-50">
            {state.status === "loading" ? "Loading…" : "Request report"}
          </button>
        </form>
        <div className="mt-3 text-[10px] leading-relaxed text-slate-500">
          <p><strong className="text-slate-300">Provider-reported timestamp:</strong> time reported by the broker; matching-engine clock accuracy is not independently established.</p>
          <p><strong className="text-slate-300">GoodTrading observation time:</strong> time when GoodTrading recorded the observation; it is not broker execution time.</p>
        </div>
        {formError ? <p role="alert" className="mt-2 text-[10px] text-amber-300">{formError}</p> : null}
      </ReportSection>

      {state.status === "idle" ? <DesktopEmptyState status="waiting" title="No LIVE report requested" description="Choose a UTC reporting window and timestamp policy." /> : null}
      {state.status === "loading" ? <DesktopEmptyState status="loading" title="Loading LIVE execution report" description="Retrieving a consistent read-only execution window." /> : null}
      {state.status === "error" ? <DesktopEmptyState status="error" title="LIVE report unavailable" description={displayError(state.code)} /> : null}
      {state.status === "success" ? <LiveReportResult report={state.report} /> : null}
    </section>
  );
}

export function LiveReportResult({ report }: { report: import("./liveExecutionWindowTypes").LiveExecutionWindowReport }) {
  const empty = report.groups.length === 0;
  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2"><ReportBadge variant="live-data">LIVE · READ ONLY</ReportBadge><span className="text-[10px] font-mono text-slate-500">{report.window.startInclusive} → {report.window.endExclusive}</span></header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono text-slate-500">
        <span>Policy: <strong className="text-slate-200">{POLICY_LABELS[report.timestampPolicy]}</strong></span>
        <span>Coverage: <strong className="text-slate-200">{report.retrievalCoverage} · {report.coverage}</strong></span>
        <span>Evidence: <strong className={report.financialEvidence === "COMPLETE" ? "text-emerald-300" : "text-amber-300"}>{report.financialEvidence}</strong></span>
        <span>Candidates: <strong className="text-slate-200">{report.candidateCount}</strong></span>
      </div>
      {report.unavailable.missingSelectedTimestamp > 0 ? <p className="text-[10px] text-amber-300">{report.unavailable.missingSelectedTimestamp} selected timestamp(s) unavailable.</p> : null}
      {report.financialEvidence === "CONFLICT" ? <p className="text-[10px] text-amber-300">Conflicting evidence is excluded; displayed figures are eligible-execution subtotals only.</p> : null}
      {report.conflicts.length > 0 ? <ReportSection title="Conflicts"><div className="text-[10px] font-mono text-amber-300">{report.conflicts.map((conflict) => <p key={conflict.scopeKey}>{conflict.executionId} · {conflict.observationCount} observations</p>)}</div></ReportSection> : null}
      {empty ? <DesktopEmptyState status="waiting" title="No executions in this period" description="The completed retrieval contained no eligible execution groups." /> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{report.groups.map((group) => <GroupCard key={`${group.instrument}-${group.venue}-${group.side}`} group={group} />)}</div>}
      <ReportSection title="Unavailable metrics"><p className="text-[10px] font-mono text-slate-500">Complete-order metrics: <strong className="text-slate-300">{report.completeOrderMetrics}</strong>. Order history coverage: <strong className="text-slate-300">{report.orderHistoryCoverage}</strong>. No economic notional, PnL, or execution-quality score is derived here.</p></ReportSection>
    </section>
  );
}
