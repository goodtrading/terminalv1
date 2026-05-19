import { useCallback, useEffect, useRef } from "react";
import type { HeatmapTrade } from "./liquidityHeatmapUtils";

export type BookmapVolumeStripProps = {
  trades: HeatmapTrade[];
  height?: number;
};

function renderVolumeStrip(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  trades: HeatmapTrade[],
) {
  ctx.fillStyle = "#080d14";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(51, 65, 85, 0.5)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, 0);
  ctx.stroke();

  ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText("VOLUME / CVD", 8, 14);

  if (!trades.length) {
    ctx.fillStyle = "rgba(100, 116, 139, 0.8)";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText("Trades / CVD pending", w / 2 - 72, h / 2 + 4);
    return;
  }

  const recent = trades.slice(-80);
  const barW = Math.max(2, (w - 16) / recent.length);
  let cvd = 0;
  let maxVol = 0;

  const bars = recent.map((t) => {
    const signed = t.side === "buy" ? t.sizeBtc : -t.sizeBtc;
    cvd += signed;
    maxVol = Math.max(maxVol, t.sizeBtc);
    return { vol: t.sizeBtc, side: t.side, cvd };
  });

  const maxCvd = Math.max(...bars.map((b) => Math.abs(b.cvd)), 0.01);

  bars.forEach((b, i) => {
    const x = 8 + i * barW;
    const barH = (b.vol / Math.max(maxVol, 0.01)) * (h * 0.45);
    const y = h * 0.55 - barH;
    ctx.fillStyle = b.side === "buy" ? "rgba(0, 220, 140, 0.55)" : "rgba(255, 70, 70, 0.55)";
    ctx.fillRect(x, y, barW - 1, barH);
  });

  ctx.strokeStyle = "rgba(250, 204, 21, 0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  bars.forEach((b, i) => {
    const x = 8 + i * barW + barW / 2;
    const y = h * 0.85 - (b.cvd / maxCvd) * (h * 0.35);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = "rgba(253, 224, 71, 0.7)";
  ctx.font = "9px ui-monospace, monospace";
  ctx.fillText(`CVD ${cvd >= 0 ? "+" : ""}${cvd.toFixed(2)} BTC`, w - 120, 14);
}

export function BookmapVolumeStrip({ trades, height = 90 }: BookmapVolumeStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const w = wrap.clientWidth;
    const h = height;
    if (w < 10) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderVolumeStrip(ctx, w, h, trades);
  }, [trades, height]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div
      ref={wrapRef}
      className="shrink-0 w-full min-w-0 border-t border-terminal-border/60 bg-[#080d14]"
      style={{ height }}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
