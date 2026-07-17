# GoodTrading AI — FASE AI-1 (Modo Mentor)

Experimental educational Mentor mode with a deterministic mock provider. No paid APIs, no live market, no Bookmap/DOM/heatmap.

## Enable locally

In server env (e.g. `.env`):

```bash
GOODTRADING_AI_ENABLED=true
GOODTRADING_AI_PROVIDER=mock
```

Restart `npm run dev`. Confirm:

1. `GET /api/runtime/features` → `goodTradingAiEnabled: true`
2. Mentor panel visible in the terminal bottom AI tab
3. Responses include `provider.mocked: true` and educational warnings

Default is **OFF**. Frontend hide alone is not enough — the backend rejects AI-1 requests when the flag is off (`AI_DISABLED`).

## Auth

`POST /api/ai/chat` uses existing `requireSaasAuth` (session/cookie/JWT). Unauthenticated → `401`.

## Limits (AI-1)

| Limit | Value |
| --- | --- |
| Message length | 1–2000 chars |
| Mode | `mentor` only |
| Provider timeout | ~5s |
| Rate limit | 10 req / user / 60s (in-memory) |
| History | No server-side conversation history; no message arrays |

**In-memory rate limit:** single-instance / local-dev only. TODO: distributed store for multi-instance production.

## What is NOT connected

- Bookmap, DOM, heatmap, order book depth
- Live gamma / orderflow / `buildLiveMarketContext`
- Paid LLM providers (OpenAI/Grok/Anthropic)
- Auto-execution, autonomous market alerts
- Client-chosen provider/model/system prompts

## AI-2 note

Knowledge Model v1 + local deterministic retrieval live under `server/ai/goodTradingAi/knowledge/`.
See `docs/goodtrading-ai-knowledge-editorial.md`. Responses may include `knowledgeReferences` and `coverage`.

## Mock → real provider later

1. Keep `AIProvider` + `createAIProvider()` factory
2. Add a server-only provider implementation (keys never on the client)
3. Extend `resolveGoodTradingAiProviderId()` with strict allow-list
4. Swap `retrieveKnowledge` for RAG while keeping citations + validator

## Tests

```bash
npm run test:goodtrading-ai
```

## Request shape

```json
{
  "schemaVersion": "1.0",
  "mode": "mentor",
  "message": "¿Qué es el Global Flip?"
}
```
