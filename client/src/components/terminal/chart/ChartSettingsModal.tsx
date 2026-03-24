import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "../common/Switch";
import type { ChartSettings, ChartSettingsTabId } from "./chartSettingsTypes";
import { getChartSettings, replaceChartSettings, resetChartSettings, setChartSettings } from "./chartSettingsStore";

const TABS: { id: ChartSettingsTabId; label: string }[] = [
  { id: "appearance", label: "Apariencia" },
  { id: "scales", label: "Escalas" },
  { id: "overlays", label: "Overlays" },
  { id: "interaction", label: "Interaccion" },
  { id: "drawings", label: "Dibujos" },
  { id: "performance", label: "Rendimiento" },
];

interface ChartSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-white/[0.07] bg-[#0d0f14]/80">
      <div className="px-3 py-2 border-b border-white/[0.07] text-[9px] tracking-[0.18em] font-mono uppercase text-white/55">
        {title}
      </div>
      <div className="p-2.5 space-y-1.5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded px-2 py-1.5 hover:bg-white/[0.03] transition-colors">
      <span className="text-[10px] font-mono text-white/70">{label}</span>
      {children}
    </div>
  );
}

export function ChartSettingsModal({ open, onClose }: ChartSettingsModalProps) {
  const [tab, setTab] = useState<ChartSettingsTabId>("appearance");
  const [draft, setDraft] = useState<ChartSettings>(() => getChartSettings());
  const snapshotRef = useRef<ChartSettings | null>(null);

  useEffect(() => {
    if (!open) return;
    const current = getChartSettings();
    snapshotRef.current = JSON.parse(JSON.stringify(current)) as ChartSettings;
    setDraft(current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (snapshotRef.current) replaceChartSettings(snapshotRef.current);
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const valueClass =
    "min-w-[120px] rounded-sm border border-white/15 bg-[#0a0c11] px-2 py-1 text-[11px] text-white/90 outline-none focus:border-red-500/70";
  const rangeClass = "w-[150px] accent-red-500";

  const patch = <K extends keyof ChartSettings>(key: K, value: ChartSettings[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setChartSettings({ [key]: value } as Partial<ChartSettings>);
    if (key === "drawings") {
      window.dispatchEvent(new CustomEvent("gt-chart-drawings-defaults"));
    }
  };

  const handleCancel = () => {
    if (snapshotRef.current) replaceChartSettings(snapshotRef.current);
    onClose();
  };

  const handleResetDefaults = () => {
    resetChartSettings();
    const now = getChartSettings();
    setDraft(now);
    window.dispatchEvent(new CustomEvent("gt-chart-drawings-defaults"));
  };

  const tabHeader = useMemo(
    () => TABS.find((t) => t.id === tab)?.label ?? "Apariencia",
    [tab]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-[2px]" role="dialog" aria-modal="true">
      <div className="w-full max-w-[760px] max-h-[90vh] overflow-hidden flex flex-col rounded-md border border-white/[0.1] bg-[#090b0f] shadow-[0_28px_80px_rgba(0,0,0,0.88)]">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08]">
          <div>
            <h2 className="text-[11px] font-mono font-bold tracking-[0.14em] text-white/90 uppercase">Opciones de configuracion</h2>
            <p className="text-[10px] font-mono text-white/45 mt-0.5">Aplicacion en vivo + persistencia automatica</p>
          </div>
          <button type="button" onClick={handleCancel} className="text-[10px] font-mono text-white/45 hover:text-white/80 px-2 py-1">
            Esc
          </button>
        </div>

        <div className="flex border-b border-white/[0.08] bg-[#0b0d12] shrink-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative px-4 py-2.5 text-[10px] font-mono uppercase tracking-[0.08em] transition-colors",
                tab === t.id ? "text-white" : "text-white/45 hover:text-white/75"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "absolute left-2 right-2 bottom-0 h-[2px] rounded-full transition-opacity",
                  tab === t.id ? "bg-red-500 opacity-100" : "bg-transparent opacity-0"
                )}
              />
            </button>
          ))}
        </div>

        <div className="px-4 py-2 border-b border-white/[0.06] text-[10px] text-white/45 font-mono uppercase tracking-[0.12em]">
          {tabHeader}
        </div>

        <div className="p-4 overflow-y-auto flex-1 text-[11px] font-mono space-y-3">
          {tab === "appearance" && (
            <>
              <Section title="Apariencia">
                <Row label="Fondo">
                  <input
                    type="color"
                    className="h-7 w-14 cursor-pointer rounded border border-white/15 bg-transparent"
                    value={draft.appearance.background}
                    onChange={(e) => patch("appearance", { ...draft.appearance, background: e.target.value })}
                  />
                </Row>
                <Row label="Mostrar grilla">
                  <Switch
                    checked={draft.appearance.showGrid}
                    onCheckedChange={(v) => patch("appearance", { ...draft.appearance, showGrid: v })}
                  />
                </Row>
                <Row label="Opacidad grilla">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      className={rangeClass}
                      value={draft.appearance.gridOpacity}
                      onChange={(e) => patch("appearance", { ...draft.appearance, gridOpacity: Number(e.target.value) })}
                    />
                    <span className="text-[10px] text-white/60 w-8 text-right">{Math.round(draft.appearance.gridOpacity * 100)}</span>
                  </div>
                </Row>
              </Section>

              <Section title="Colores de velas">
                <Row label="Alcista">
                  <input
                    type="color"
                    className="h-7 w-14 cursor-pointer rounded border border-white/15"
                    value={draft.appearance.candleUpColor}
                    onChange={(e) => patch("appearance", { ...draft.appearance, candleUpColor: e.target.value })}
                  />
                </Row>
                <Row label="Bajista">
                  <input
                    type="color"
                    className="h-7 w-14 cursor-pointer rounded border border-white/15"
                    value={draft.appearance.candleDownColor}
                    onChange={(e) => patch("appearance", { ...draft.appearance, candleDownColor: e.target.value })}
                  />
                </Row>
              </Section>

              <Section title="Texto">
                <Row label="Color">
                  <input
                    type="color"
                    className="h-7 w-14 cursor-pointer rounded border border-white/15"
                    value={draft.appearance.textColor}
                    onChange={(e) => patch("appearance", { ...draft.appearance, textColor: e.target.value })}
                  />
                </Row>
              </Section>
            </>
          )}

          {tab === "scales" && (
            <Section title="Escalas">
              <Row label="Auto escala">
                <Switch checked={draft.scales.autoScale} onCheckedChange={(v) => patch("scales", { ...draft.scales, autoScale: v })} />
              </Row>
              <Row label="Escala de precio">
                <Switch
                  checked={draft.scales.showPriceScale}
                  onCheckedChange={(v) => patch("scales", { ...draft.scales, showPriceScale: v })}
                />
              </Row>
              <Row label="Escala de tiempo">
                <Switch
                  checked={draft.scales.showTimeScale}
                  onCheckedChange={(v) => patch("scales", { ...draft.scales, showTimeScale: v })}
                />
              </Row>
              <Row label="Precision precio">
                <input
                  type="number"
                  min={0}
                  max={8}
                  className={valueClass}
                  value={draft.scales.pricePrecision}
                  onChange={(e) => patch("scales", { ...draft.scales, pricePrecision: Number(e.target.value) })}
                />
              </Row>
            </Section>
          )}

          {tab === "overlays" && (
            <Section title="Capas institucionales">
              {(
                [
                  ["showGamma", "Gamma"],
                  ["showHeatmap", "Heatmap"],
                  ["showLiquidity", "Liquidez / niveles"],
                  ["showSweeps", "Sweeps"],
                  ["showAbsorptions", "Absorciones"],
                  ["showMagnets", "Imanes / gravedad"],
                ] as const
              ).map(([key, labelText]) => (
                <Row key={key} label={labelText}>
                  <Switch checked={draft.overlays[key]} onCheckedChange={(v) => patch("overlays", { ...draft.overlays, [key]: v })} />
                </Row>
              ))}
            </Section>
          )}

          {tab === "interaction" && (
            <Section title="Interaccion">
              <Row label="Bloquear cruz por tiempo">
                <Switch
                  checked={draft.interaction.lockCrosshairByTime}
                  onCheckedChange={(v) => patch("interaction", { ...draft.interaction, lockCrosshairByTime: v })}
                />
              </Row>
              <Row label="Crosshair horizontal">
                <Switch
                  checked={draft.interaction.showCrosshairHorizontal}
                  onCheckedChange={(v) => patch("interaction", { ...draft.interaction, showCrosshairHorizontal: v })}
                />
              </Row>
              <Row label="Crosshair vertical">
                <Switch
                  checked={draft.interaction.showCrosshairVertical}
                  onCheckedChange={(v) => patch("interaction", { ...draft.interaction, showCrosshairVertical: v })}
                />
              </Row>
              <Row label="Menu click derecho">
                <Switch
                  checked={draft.interaction.rightClickEnabled}
                  onCheckedChange={(v) => patch("interaction", { ...draft.interaction, rightClickEnabled: v })}
                />
              </Row>
            </Section>
          )}

          {tab === "drawings" && (
            <Section title="Defaults de dibujos">
              <Row label="Color por defecto">
                <input
                  type="color"
                  className="h-7 w-14 cursor-pointer rounded border border-white/15"
                  value={draft.drawings.defaultColor}
                  onChange={(e) => patch("drawings", { ...draft.drawings, defaultColor: e.target.value })}
                />
              </Row>
              <Row label="Grosor linea">
                <input
                  type="number"
                  min={1}
                  max={8}
                  className={valueClass}
                  value={draft.drawings.defaultLineWidth}
                  onChange={(e) => patch("drawings", { ...draft.drawings, defaultLineWidth: Number(e.target.value) })}
                />
              </Row>
              <Row label="Opacidad">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.01}
                    className={rangeClass}
                    value={draft.drawings.defaultOpacity}
                    onChange={(e) => patch("drawings", { ...draft.drawings, defaultOpacity: Number(e.target.value) })}
                  />
                  <span className="text-[10px] text-white/60 w-8 text-right">{Math.round(draft.drawings.defaultOpacity * 100)}</span>
                </div>
              </Row>
              <Row label="Tamano texto">
                <input
                  type="number"
                  min={8}
                  max={24}
                  className={valueClass}
                  value={draft.drawings.defaultTextSize}
                  onChange={(e) => patch("drawings", { ...draft.drawings, defaultTextSize: Number(e.target.value) })}
                />
              </Row>
            </Section>
          )}

          {tab === "performance" && (
            <>
              <Section title="Rendimiento">
                <Row label="Modo seguro">
                  <Switch
                    checked={draft.performance.safeMode}
                    onCheckedChange={(v) => patch("performance", { ...draft.performance, safeMode: v })}
                  />
                </Row>
                <Row label="Reducir etiquetas">
                  <Switch
                    checked={draft.performance.reduceLabels}
                    onCheckedChange={(v) => patch("performance", { ...draft.performance, reduceLabels: v })}
                  />
                </Row>
                <Row label="Throttle redraw">
                  <Switch
                    checked={draft.performance.throttleRedraw}
                    onCheckedChange={(v) => patch("performance", { ...draft.performance, throttleRedraw: v })}
                  />
                </Row>
              </Section>
              <Section title="Modo institucional (preview)">
                <div className="px-2 py-1 text-[10px] text-white/50 leading-relaxed">
                  La estructura esta preparada para incluir perfiles como Execution Mode / Key Levels Only sin fake UI.
                  Falta cablear flags nuevos en `ChartSettings` y motor de overlays para activarlo.
                </div>
              </Section>
            </>
          )}
        </div>

        <div className="flex justify-between gap-2 px-4 py-2.5 border-t border-white/[0.08] bg-[#0b0d12]">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 text-[10px] font-mono border border-red-500/35 rounded-sm text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Restablecer defaults
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="px-3 py-1.5 text-[10px] font-mono border border-white/15 rounded-sm text-white/75 hover:bg-white/5 transition-colors"
          >
            Cancelar sesion
          </button>
        </div>
      </div>
    </div>
  );
}
