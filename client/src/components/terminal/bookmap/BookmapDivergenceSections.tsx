import type { ComponentType, ReactNode } from "react";
import type { BookmapVisualSettings } from "./bookmapSettings";

type Props = {
  settings: BookmapVisualSettings;
  bothMode: boolean;
  onChange: (patch: Partial<BookmapVisualSettings>) => void;
  Toggle: ComponentType<{
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }>;
  Row: ComponentType<{ label: string; children: ReactNode }>;
  inputClass: string;
};

export function BookmapDivergenceSections({
  settings,
  bothMode,
  onChange,
  Toggle,
  Row,
  inputClass,
}: Props) {
  const set = (patch: Partial<BookmapVisualSettings["divergence"]>) =>
    onChange({ divergence: { ...settings.divergence, ...patch } });

  const disabled = !settings.divergence.enabled || !bothMode;

  return (
    <>
      <Row label="Spot/Perp divergence">
        <Toggle
          checked={settings.divergence.enabled && bothMode}
          onChange={(enabled) => set({ enabled })}
        />
      </Row>
      {!bothMode && (
        <p className="text-[8px] font-mono text-slate-600 col-span-2">
          Available in Both source mode only.
        </p>
      )}
      <Row label="Signal panel">
        <Toggle
          checked={settings.divergence.showPanel}
          disabled={disabled}
          onChange={(showPanel) => set({ showPanel })}
        />
      </Row>
      <Row label="Min confidence">
        <select
          value={settings.divergence.minSeverity}
          disabled={disabled}
          onChange={(e) =>
            set({
              minSeverity: e.target.value === "high" ? "high" : "medium",
            })
          }
          className={inputClass}
        >
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </Row>
      <Row label="Passive liquidity signals">
        <Toggle
          checked={settings.divergence.passiveLiquidity}
          disabled={disabled}
          onChange={(passiveLiquidity) => set({ passiveLiquidity })}
        />
      </Row>
      <Row label="Aggression divergence">
        <Toggle
          checked={settings.divergence.aggressionDivergence}
          disabled={disabled}
          onChange={(aggressionDivergence) => set({ aggressionDivergence })}
        />
      </Row>
      <Row label="Confluence signals">
        <Toggle
          checked={settings.divergence.confluenceSignals}
          disabled={disabled}
          onChange={(confluenceSignals) => set({ confluenceSignals })}
        />
      </Row>
      <Row label="Show invalidation">
        <Toggle
          checked={settings.divergence.showInvalidation}
          disabled={disabled}
          onChange={(showInvalidation) => set({ showInvalidation })}
        />
      </Row>
      <Row label="Show bias">
        <Toggle
          checked={settings.divergence.showBias}
          disabled={disabled}
          onChange={(showBias) => set({ showBias })}
        />
      </Row>
      <Row label="Chart markers">
        <Toggle
          checked={settings.divergence.showChartMarkers}
          disabled={disabled}
          onChange={(showChartMarkers) => set({ showChartMarkers })}
        />
      </Row>
    </>
  );
}
