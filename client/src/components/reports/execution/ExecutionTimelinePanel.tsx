import { cn } from "@/lib/utils";
import type {
  ExecutionTimelineEvent,
  ExecutionTimelineReplay,
  ExecutionTimelineSeverity,
} from "./executionReportTypes";

function severityClass(severity: ExecutionTimelineSeverity): string {
  switch (severity) {
    case "positive":
      return "text-emerald-400/90 border-emerald-900/40";
    case "warning":
      return "text-amber-400/90 border-amber-900/40";
    case "danger":
      return "text-red-400/90 border-red-900/40";
    case "info":
      return "text-cyan-400/80 border-cyan-900/30";
    default:
      return "text-slate-500 border-white/[0.06]";
  }
}

function eventPrefix(type: ExecutionTimelineEvent["type"]): string {
  switch (type) {
    case "entry":
      return "ENTRY";
    case "context_captured":
      return "CONTEXT";
    case "playbook_detected":
      return "PLAYBOOK";
    case "risk_update":
      return "RISK";
    case "sl_tp_update":
      return "SL/TP";
    case "exit":
      return "EXIT";
    case "playbook_delta":
      return "DELTA";
    case "diagnosis":
      return "DIAGNOSIS";
    default:
      return "EVENT";
  }
}

function TimelineEventLine({ event }: { event: ExecutionTimelineEvent }) {
  const prefix = eventPrefix(event.type);
  const title = event.title?.toUpperCase() === prefix ? prefix : event.title;
  return (
    <div
      className={cn(
        "flex gap-2 py-0.5 px-1.5 rounded border border-transparent font-mono text-[10px] leading-snug",
        severityClass(event.severity),
      )}
    >
      <span className="shrink-0 font-bold uppercase tracking-wider opacity-80">
        [{title}]
      </span>
      <span className="text-slate-400 min-w-0 break-words">{event.message}</span>
    </div>
  );
}

const MAX_VISIBLE_EVENTS = 7;

export function ExecutionTimelinePanel({
  timeline,
}: {
  timeline: ExecutionTimelineReplay | null | undefined;
}) {
  if (!timeline || timeline.status === "unavailable") {
    return (
      <p className="text-[10px] font-mono text-slate-600 py-1">
        {timeline?.summary ??
          "Timeline unavailable — context not captured."}
      </p>
    );
  }

  const events = (timeline.events ?? []).slice(0, MAX_VISIBLE_EVENTS);

  return (
    <div className="py-2 px-2 rounded border border-white/[0.06] bg-[#080808] space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
          Timeline replay
        </span>
        <span
          className={cn(
            "text-[8px] uppercase tracking-wider px-1 py-0.5 rounded border",
            timeline.status === "available"
              ? "text-emerald-500/70 border-emerald-900/40"
              : "text-amber-500/70 border-amber-900/40",
          )}
        >
          {timeline.status}
        </span>
      </div>
      <p className="text-[10px] text-slate-500 italic leading-snug">
        {timeline.summary}
      </p>
      {events.length > 0 ? (
        <div className="space-y-0.5">
          {events.map((ev) => (
            <TimelineEventLine key={ev.id} event={ev} />
          ))}
        </div>
      ) : (
        <p className="text-[10px] font-mono text-slate-600">
          No timeline events for this trade.
        </p>
      )}
    </div>
  );
}
