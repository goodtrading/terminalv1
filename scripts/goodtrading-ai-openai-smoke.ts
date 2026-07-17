/**
 * Paid OpenAI Mentors smoke — NEVER run in CI.
 *
 * Requires:
 *   GOODTRADING_AI_PROVIDER=openai
 *   OPENAI_API_KEY=...
 *   GOODTRADING_AI_ALLOW_PAID_SMOKE=true
 *   GOODTRADING_AI_ENABLED=true (for service path)
 *
 * Prints: success, model, duration, tokens, refs — never key/prompt/corpus.
 */
import { GoodTradingAIService } from "../server/ai/goodTradingAi/service";
import { loadGoodTradingOpenAIConfig } from "../server/ai/goodTradingAi/openaiConfig";

async function main(): Promise<void> {
  if (process.env.GOODTRADING_AI_ALLOW_PAID_SMOKE !== "true") {
    console.error("BLOCKED — set GOODTRADING_AI_ALLOW_PAID_SMOKE=true to run paid smoke.");
    process.exit(2);
  }
  if ((process.env.GOODTRADING_AI_PROVIDER ?? "").toLowerCase() !== "openai") {
    console.error("BLOCKED — GOODTRADING_AI_PROVIDER must be openai.");
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error("BLOCKED — OPENAI_API_KEY missing.");
    process.exit(2);
  }

  process.env.GOODTRADING_AI_ENABLED = "true";
  const cfg = loadGoodTradingOpenAIConfig();
  const started = Date.now();
  const svc = new GoodTradingAIService();
  const res = await svc.handleChat({
    schemaVersion: "1.0",
    mode: "mentor",
    message: "Explicame brevemente qué es Gamma en la metodología GoodTrading.",
  });
  const durationMs = Date.now() - started;

  console.log(
    JSON.stringify(
      {
        success: true,
        provider: res.provider.id,
        mocked: res.provider.mocked,
        model: res.provider.model || cfg.model,
        durationMs: res.usage.durationMs ?? durationMs,
        inputTokens: res.usage.inputTokens ?? null,
        outputTokens: res.usage.outputTokens ?? null,
        estimatedCostUsd: res.usage.estimatedCostUsd ?? null,
        coverage: res.coverage ?? null,
        refCount: res.knowledgeReferences?.length ?? 0,
        refIds: (res.knowledgeReferences ?? []).map((r) => r.id),
        requestId: res.requestId,
        summaryChars: res.summary.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : "ERROR";
  console.error(JSON.stringify({ success: false, errorCategory: code }));
  process.exit(1);
});
