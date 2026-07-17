/**
 * GoodTrading AI Lab / Calibration Lab — internal only.
 * Separate from AIChatPanel Mentor product UI.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { apiUrl } from "@/lib/apiBase";
import type {
  CalibrationCase,
  CalibrationDecision,
  CalibrationDomain,
  CalibrationMetrics,
  CalibrationReview,
  CalibrationAiSnapshot,
  KnowledgeChangeProposal,
} from "@shared/goodTradingAiCalibration";

const DECISIONS: CalibrationDecision[] = [
  "APPROVED",
  "APPROVED_WITH_CHANGES",
  "REJECTED",
  "NEEDS_MORE_CONTEXT",
  "SKIPPED",
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body?.message === "string" ? body.message : `HTTP ${res.status}`);
  }
  return body as T;
}

function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function CalibrationLabPage() {
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<CalibrationCase[]>([]);
  const [idx, setIdx] = useState(0);
  const [domainFilter, setDomainFilter] = useState<CalibrationDomain | "">("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [reviewsByCase, setReviewsByCase] = useState<Record<string, CalibrationReview>>({});
  const [ai, setAi] = useState<CalibrationAiSnapshot | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [ignacioAnswer, setIgnacioAnswer] = useState("");
  const [corrections, setCorrections] = useState("");
  const [missingContext, setMissingContext] = useState("");
  const [notes, setNotes] = useState("");
  const [decision, setDecision] = useState<CalibrationDecision>("NEEDS_MORE_CONTEXT");
  const [metrics, setMetrics] = useState<CalibrationMetrics | null>(null);
  const [proposals, setProposals] = useState<KnowledgeChangeProposal[]>([]);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (domainFilter && c.domain !== domainFilter) return false;
      if (statusFilter) {
        const r = reviewsByCase[c.id];
        if (statusFilter === "pending" && r) return false;
        if (statusFilter !== "pending" && r?.decision !== statusFilter) return false;
      }
      return true;
    });
  }, [cases, domainFilter, statusFilter, reviewsByCase]);

  const current = filtered[idx] ?? filtered[0];

  const loadMeta = useCallback(async () => {
    setError(null);
    try {
      const [casesRes, reviewsRes, metricsRes, propRes] = await Promise.all([
        api<{ cases: CalibrationCase[] }>("/api/internal/ai/calibration/cases"),
        api<{ reviews: CalibrationReview[] }>("/api/internal/ai/calibration/reviews"),
        api<{ metrics: CalibrationMetrics }>("/api/internal/ai/calibration/metrics"),
        api<{ proposals: KnowledgeChangeProposal[] }>("/api/internal/ai/calibration/proposals"),
      ]);
      setCases(casesRes.cases);
      const map: Record<string, CalibrationReview> = {};
      for (const r of reviewsRes.reviews) {
        const prev = map[r.caseId];
        if (!prev || r.version > prev.version) map[r.caseId] = r;
      }
      setReviewsByCase(map);
      setMetrics(metricsRes.metrics);
      setProposals(propRes.proposals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de acceso al Lab");
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!current) return;
    setLoadingAi(true);
    setAi(null);
    const r = reviewsByCase[current.id];
    if (r) {
      setIgnacioAnswer(r.ignacioAnswer);
      setCorrections(r.corrections);
      setMissingContext(r.missingContext);
      setNotes(r.notes);
      setDecision(r.decision);
    } else {
      setIgnacioAnswer("");
      setCorrections("");
      setMissingContext("");
      setNotes("");
      setDecision("NEEDS_MORE_CONTEXT");
    }
    void api<{ ai: CalibrationAiSnapshot }>(
      `/api/internal/ai/calibration/cases/${encodeURIComponent(current.id)}/ai-response`,
    )
      .then((d) => setAi(d.ai))
      .catch((e) => setError(e instanceof Error ? e.message : "AI snapshot failed"))
      .finally(() => setLoadingAi(false));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const progress = metrics
    ? `${metrics.reviewed}/${metrics.totalCases} revisados`
    : `${Object.keys(reviewsByCase).length}/${cases.length}`;

  async function saveReview() {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ review: CalibrationReview; proposals: KnowledgeChangeProposal[] }>(
        "/api/internal/ai/calibration/reviews",
        {
          method: "POST",
          body: JSON.stringify({
            caseId: current.id,
            decision,
            ignacioAnswer,
            corrections,
            missingContext,
            notes,
          }),
        },
      );
      setReviewsByCase((prev) => ({ ...prev, [current.id]: res.review }));
      setProposals((prev) => {
        const others = prev.filter((p) => p.reviewId !== res.review.id);
        return [...others, ...res.proposals];
      });
      const m = await api<{ metrics: CalibrationMetrics }>("/api/internal/ai/calibration/metrics");
      setMetrics(m.metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraftLocal() {
    if (!current) return;
    try {
      await api("/api/internal/ai/calibration/drafts", {
        method: "POST",
        body: JSON.stringify({
          caseId: current.id,
          draft: { ignacioAnswer, corrections, missingContext, notes, decision },
        }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Draft failed");
    }
  }

  function exportLocal() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            reviews: Object.values(reviewsByCase),
            proposals,
            metrics,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `calibration-export-${Date.now()}.json`;
    a.click();
  }

  if (error && cases.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-200 p-6 font-mono text-sm">
        <h1 className="text-lg text-amber-200 mb-2">GoodTrading AI Lab</h1>
        <p className="text-red-300">{error}</p>
        <p className="mt-4 text-zinc-500">
          Requiere admin + <code>GOODTRADING_AI_CALIBRATION_ENABLED=true</code>
        </p>
        <Link href="/admin" className="text-sky-400 underline mt-4 inline-block">
          Volver a Admin
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" data-testid="calibration-lab">
      <header className="border-b border-zinc-800 px-4 py-3 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">GoodTrading AI Lab — Calibration</h1>
          <p className="text-[11px] text-amber-200/90 font-mono">
            Uso interno — Metodología GoodTrading · no es el panel Mentor de producto
          </p>
        </div>
        <div className="text-[11px] font-mono text-zinc-400 flex gap-3 items-center">
          <span>{progress}</span>
          <Link href="/admin" className="text-sky-400 hover:underline">
            Admin
          </Link>
          <button type="button" className="border border-zinc-700 px-2 py-1 rounded" onClick={exportLocal}>
            Export JSON
          </button>
        </div>
      </header>

      {error ? <div className="px-4 py-2 text-red-300 text-sm font-mono">{error}</div> : null}

      <div className="grid lg:grid-cols-[280px_1fr] gap-0 min-h-[calc(100vh-64px)]">
        <aside className="border-r border-zinc-800 p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-64px)]">
          <label className="block text-[10px] uppercase text-zinc-500">Dominio</label>
          <select
            className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs p-1"
            value={domainFilter}
            onChange={(e) => {
              setDomainFilter(e.target.value as CalibrationDomain | "");
              setIdx(0);
            }}
          >
            <option value="">Todos</option>
            {(
              [
                "constitution",
                "liquidity",
                "order_flow",
                "gamma",
                "delta_cvd_oi",
                "execution_risk",
                "compound_setup",
              ] as CalibrationDomain[]
            ).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <label className="block text-[10px] uppercase text-zinc-500">Estado</label>
          <select
            className="w-full bg-zinc-900 border border-zinc-700 rounded text-xs p-1"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setIdx(0);
            }}
          >
            <option value="">Todos</option>
            <option value="pending">pending</option>
            {DECISIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          {metrics ? (
            <div className="text-[10px] font-mono text-zinc-400 space-y-1 border border-zinc-800 rounded p-2">
              <div>Approved: {metrics.approved}</div>
              <div>With changes: {metrics.approvedWithChanges}</div>
              <div>Rejected: {metrics.rejected}</div>
              <div>Needs ctx: {metrics.needsContext}</div>
              <div>Proposals pending: {metrics.pendingProposals}</div>
              <div>Golden: {metrics.goldenCount}</div>
            </div>
          ) : null}
          <ul className="space-y-1 text-[11px]">
            {filtered.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`w-full text-left px-2 py-1 rounded border ${
                    current?.id === c.id ? "border-emerald-500/50 bg-emerald-500/10" : "border-transparent hover:bg-zinc-900"
                  }`}
                  onClick={() => setIdx(i)}
                >
                  <span className="font-mono text-zinc-500">{c.id}</span>
                  <div className="truncate">{c.title}</div>
                  <div className="text-[10px] text-zinc-500">
                    {reviewsByCase[c.id]?.decision ?? "pending"}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-64px)]">
          {!current ? (
            <p className="text-zinc-500">Sin casos.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="border border-zinc-700 px-2 py-1 rounded text-xs"
                  disabled={idx <= 0}
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                >
                  ← Prev
                </button>
                <button
                  type="button"
                  className="border border-zinc-700 px-2 py-1 rounded text-xs"
                  disabled={idx >= filtered.length - 1}
                  onClick={() => setIdx((i) => Math.min(filtered.length - 1, i + 1))}
                >
                  Next →
                </button>
                <span className="text-xs text-zinc-500 font-mono self-center">
                  {idx + 1}/{filtered.length} · {current.domain} · {current.difficulty}
                </span>
              </div>

              <section className="space-y-1">
                <h2 className="text-sm font-semibold">{current.title}</h2>
                <div className="text-[11px] font-mono text-zinc-500">{current.id}</div>
                <div className="text-sm border border-zinc-800 rounded p-3 bg-zinc-900/40">
                  <div className="text-[10px] uppercase text-zinc-500 mb-1">Pregunta</div>
                  <p>{current.question}</p>
                </div>
                <div className="text-sm border border-zinc-800 rounded p-3 bg-zinc-900/20">
                  <div className="text-[10px] uppercase text-zinc-500 mb-1">Contexto</div>
                  <p className="text-zinc-300 whitespace-pre-wrap">{current.context}</p>
                </div>
              </section>

              <section className="border border-zinc-800 rounded p-3 space-y-2">
                <div className="text-[10px] uppercase text-zinc-500">Respuesta actual GoodTrading AI (Mentor)</div>
                {loadingAi ? (
                  <p className="text-xs text-zinc-500">Generando snapshot determinista…</p>
                ) : ai ? (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{ai.summary}</p>
                    <div className="text-[11px] text-zinc-400">
                      Cobertura: {ai.coverage} · Intent: {ai.intent} · Registry: {ai.registryVersion}
                    </div>
                    {ai.knowledgeReferences.length > 0 ? (
                      <ul className="text-[11px] list-disc pl-4 text-zinc-400">
                        {ai.knowledgeReferences.map((r) => (
                          <li key={r.id}>
                            {r.title} ({r.category} · {r.kind})
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {ai.observations.length > 0 ? (
                      <div className="text-[11px] space-y-1">
                        <div className="text-zinc-500">Observaciones</div>
                        {ai.observations.map((o) => (
                          <div key={o.id} className="text-zinc-300">
                            {o.title}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="text-xs text-zinc-500">Sin snapshot</p>
                )}
              </section>

              <section className="border border-amber-900/40 rounded p-3 space-y-2 bg-amber-950/10">
                <div className="text-[10px] uppercase text-amber-200/80">Qué haría Ignacio</div>
                <textarea
                  className="w-full min-h-[120px] bg-zinc-950 border border-zinc-700 rounded p-2 text-sm"
                  value={ignacioAnswer}
                  onChange={(e) => setIgnacioAnswer(e.target.value)}
                  placeholder="Respuesta / razonamiento editorial (texto, no código ejecutable)"
                />
                <label className="block text-[10px] text-zinc-500">Correcciones</label>
                <textarea
                  className="w-full min-h-[80px] bg-zinc-950 border border-zinc-700 rounded p-2 text-sm"
                  value={corrections}
                  onChange={(e) => setCorrections(e.target.value)}
                />
                <label className="block text-[10px] text-zinc-500">Contexto faltante</label>
                <textarea
                  className="w-full min-h-[60px] bg-zinc-950 border border-zinc-700 rounded p-2 text-sm"
                  value={missingContext}
                  onChange={(e) => setMissingContext(e.target.value)}
                />
                <label className="block text-[10px] text-zinc-500">Notas</label>
                <textarea
                  className="w-full min-h-[60px] bg-zinc-950 border border-zinc-700 rounded p-2 text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {DECISIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`text-[10px] px-2 py-1 rounded border ${
                        decision === d ? "border-emerald-500 bg-emerald-500/15" : "border-zinc-700"
                      }`}
                      onClick={() => setDecision(d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    className="px-3 py-2 rounded border border-emerald-600/50 bg-emerald-600/20 text-sm"
                    onClick={() => void saveReview()}
                  >
                    {saving ? "Guardando…" : "Guardar revisión"}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-2 rounded border border-zinc-700 text-sm"
                    onClick={() => void saveDraftLocal()}
                  >
                    Guardar draft
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Guardar revisión NO aplica cambios al knowledge registry. Las proposals se revisan y se aplican solo
                  offline con CLI dry-run.
                </p>
              </section>

              {current && proposals.filter((p) => p.caseId === current.id).length > 0 ? (
                <section className="border border-zinc-800 rounded p-3 space-y-2">
                  <div className="text-[10px] uppercase text-zinc-500">Proposals (solo lectura / no auto-apply)</div>
                  {proposals
                    .filter((p) => p.caseId === current.id)
                    .map((p) => (
                      <div key={p.id} className="text-[11px] font-mono border border-zinc-800 rounded p-2">
                        <div>
                          {p.id} · {p.changeType} · {p.risk} · {p.status}
                        </div>
                        <div className="text-zinc-400 whitespace-pre-wrap">{escapeText(p.reason)}</div>
                      </div>
                    ))}
                </section>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
