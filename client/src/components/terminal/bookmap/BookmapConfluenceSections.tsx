import type { ReactNode } from "react";
import type {
  BookmapConfluencePrefs,
  ConfluenceMinDisplayTier,
  ConfluenceSensitivity,
  ConfluenceVisualOpacity,
} from "@/components/flows/bookmapConfluenceConfig";
import { BookmapToggleButton } from "./BookmapToolbarSegments";

const selectClass =
  "bg-[#0a121c] border border-slate-700/80 rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-200 disabled:opacity-40";

function ConfigSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-cyan-500/10 pb-2.5 mb-2.5 last:border-0 last:mb-0 last:pb-0">
      <h3 className="text-[9px] font-mono uppercase tracking-widest text-cyan-400/80 mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function ConfigRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-[10px] font-mono text-slate-500 shrink-0">{label}</span>
      <div className="flex flex-wrap items-center gap-1 justify-end min-w-0">{children}</div>
    </div>
  );
}

export type BookmapConfluenceControls = {
  bothMode: boolean;
  prefs: BookmapConfluencePrefs;
  onChange: (patch: Partial<BookmapConfluencePrefs>) => void;
};

export function BookmapConfluenceSections({
  bothMode,
  prefs,
  onChange,
}: BookmapConfluenceControls) {
  const disabled = !bothMode;

  return (
    <ConfigSection title="Confluence">
      {!bothMode && (
        <p className="text-[9px] font-mono text-slate-600 leading-relaxed">
          Passive Spot + Perp confluence is available in Both mode.
        </p>
      )}
      <ConfigRow label="Passive confluence">
        <BookmapToggleButton
          label={prefs.passiveConfluenceEnabled ? "ON" : "OFF"}
          active={prefs.passiveConfluenceEnabled}
          onClick={() =>
            onChange({ passiveConfluenceEnabled: !prefs.passiveConfluenceEnabled })
          }
          disabled={disabled}
          activeClassName="border-fuchsia-500/40 text-fuchsia-200"
        />
      </ConfigRow>
      <ConfigRow label="Min tier">
        <select
          value={prefs.minDisplayTier}
          disabled={disabled}
          onChange={(e) =>
            onChange({ minDisplayTier: e.target.value as ConfluenceMinDisplayTier })
          }
          className={selectClass}
        >
          <option value="medium">Medium</option>
          <option value="strong">Strong</option>
          <option value="major">Major</option>
        </select>
      </ConfigRow>
      <ConfigRow label="Sensitivity">
        <select
          value={prefs.sensitivity}
          disabled={disabled}
          onChange={(e) =>
            onChange({ sensitivity: e.target.value as ConfluenceSensitivity })
          }
          className={selectClass}
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </ConfigRow>
      <ConfigRow label="Opacity">
        <select
          value={prefs.visualOpacity}
          disabled={disabled}
          onChange={(e) =>
            onChange({ visualOpacity: e.target.value as ConfluenceVisualOpacity })
          }
          className={selectClass}
        >
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
        </select>
      </ConfigRow>
      <ConfigRow label="Labels">
        <BookmapToggleButton
          label={prefs.showConfluenceLabels ? "ON" : "OFF"}
          active={prefs.showConfluenceLabels}
          onClick={() => onChange({ showConfluenceLabels: !prefs.showConfluenceLabels })}
          disabled={disabled}
          activeClassName="border-fuchsia-500/40 text-fuchsia-200"
        />
      </ConfigRow>
    </ConfigSection>
  );
}
