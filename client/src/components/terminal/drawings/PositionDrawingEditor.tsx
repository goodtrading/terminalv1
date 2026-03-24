import { useEffect, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { Drawing } from "./types";
import { isPositionDrawing } from "./positionUtils";
import { Switch } from "../common/Switch";

interface PositionDrawingEditorProps {
  open: boolean;
  drawing: Drawing;
  onClose: () => void;
  onUpdate: (updates: Partial<Drawing>) => void;
  onUpdateLevels: (updates: Partial<Pick<Drawing, "entryPrice" | "targetPrice" | "stopPrice">>) => void;
}

export function PositionDrawingEditor({ open, drawing, onClose, onUpdate, onUpdateLevels }: PositionDrawingEditorProps) {
  const [tab, setTab] = useState<"inputs" | "style" | "visibility">("inputs");
  const panelRef = useRef<HTMLDivElement>(null);

  const isPosition = isPositionDrawing(drawing);
  const precision = isPosition ? drawing.labelPrecision ?? 2 : 2;
  const entry = isPosition ? drawing.entryPrice ?? drawing.points[0]?.price ?? 0 : 0;
  const target = isPosition ? drawing.targetPrice ?? entry : 0;
  const stop = isPosition ? drawing.stopPrice ?? entry : 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !isPosition) return null;

  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-[2px] p-4"
      style={{ pointerEvents: "auto" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="w-full max-w-[560px] rounded-md border border-white/10 bg-[#0a0c10]" onMouseDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
          <div className="text-[11px] font-mono uppercase tracking-wider text-white/85">Editar posicion</div>
          <button className="text-[10px] text-white/60 hover:text-white" onClick={onClose}>Cerrar</button>
        </div>
        <div className="flex px-2 py-1 border-b border-white/10">
          {[
            { id: "inputs", label: "Entradas de datos" },
            { id: "style", label: "Estilo" },
            { id: "visibility", label: "Visibilidad" },
          ].map((t) => (
            <button
              key={t.id}
              className={`px-3 py-1.5 text-[10px] font-mono ${tab === t.id ? "text-white border-b-2 border-red-500" : "text-white/50"}`}
              onClick={() => setTab(t.id as typeof tab)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-3 space-y-2 text-[11px] font-mono">
          {tab === "inputs" && (
            <>
              <Row label="Account size"><Num value={drawing.accountSize ?? 10000} onChange={(v) => onUpdate({ accountSize: v })} /></Row>
              <Row label="Quantity"><Num value={drawing.quantity ?? 0} onChange={(v) => onUpdate({ quantity: v })} /></Row>
              <Row label="Risk %"><Num value={drawing.riskPercent ?? 1} onChange={(v) => onUpdate({ riskPercent: v })} /></Row>
              <Row label="Leverage"><Num value={drawing.leverage ?? 1} onChange={(v) => onUpdate({ leverage: v })} /></Row>
              <Row label="Entry"><Num value={entry} onChange={(v) => onUpdateLevels({ entryPrice: v })} /></Row>
              <Row label="Target"><Num value={target} onChange={(v) => onUpdateLevels({ targetPrice: v })} /></Row>
              <Row label="Stop"><Num value={stop} onChange={(v) => onUpdateLevels({ stopPrice: v })} /></Row>
            </>
          )}
          {tab === "style" && (
            <>
              <Row label="Target color"><input type="color" value={drawing.targetColor ?? "#22c55e"} onChange={(e) => onUpdate({ targetColor: e.target.value })} /></Row>
              <Row label="Stop color"><input type="color" value={drawing.stopColor ?? "#ef4444"} onChange={(e) => onUpdate({ stopColor: e.target.value })} /></Row>
              <Row label="Opacity"><Num value={drawing.opacity ?? 0.9} step={0.05} onChange={(v) => onUpdate({ opacity: v })} /></Row>
            </>
          )}
          {tab === "visibility" && (
            <>
              <Row label="Mostrar labels">
                <Switch checked={drawing.showLabels !== false} onCheckedChange={(v) => onUpdate({ showLabels: v })} />
              </Row>
              <Row label="Precision">
                <Num value={precision} onChange={(v) => onUpdate({ labelPrecision: Math.max(0, Math.floor(v)) })} />
              </Row>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-center justify-between py-1 border-b border-white/5"><span className="text-white/65">{label}</span>{children}</div>;
}

function Num({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return <input className="w-[140px] bg-black/50 border border-white/15 rounded px-2 py-1 text-white" type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />;
}

