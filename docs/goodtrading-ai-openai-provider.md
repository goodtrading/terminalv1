# GoodTrading AI — proveedor OpenAI (FASE AI-3)

Proveedor Mentors real detrás de `AIProvider`, usando la **Responses API** del SDK oficial `openai` (ya en dependencias). El mock sigue siendo el default para tests/dev.

## Qué hace / qué no hace

- **Sí:** pregunta validada → retrieval Brain (4–8) → prompt servidor → Responses API → JSON estructurado → `responseValidator` → contrato Mentor.
- **No:** mercado en vivo, Bookmap, `buildLiveMarketContext`, Assistants API, tools/function calling, web/file search, fine-tuning, cadenas agenticas.
- El **cliente nunca** elige provider/model/temperatura. La API key es **solo servidor**.

## Variables de entorno

| Variable | Default | Notas |
|---|---|---|
| `GOODTRADING_AI_ENABLED` | `false` | Flag del Mentors |
| `GOODTRADING_AI_PROVIDER` | `mock` | `mock` \| `openai`. Desconocido → mock + warning |
| `OPENAI_API_KEY` | — | Requerida solo si provider=`openai` |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Solo servidor |
| `OPENAI_MAX_OUTPUT_TOKENS` | `900` | Clamp 700–1200 |
| `OPENAI_TIMEOUT_MS` | `15000` | Timeout servidor |
| `OPENAI_REASONING_EFFORT` | — | Opcional (`none`/`low`/`medium`/`high`/`xhigh`) |
| `OPENAI_STORE_RESPONSES` | `false` | Forzado `store:false` (privacidad) |
| `GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK` | `false` | Si `true`, falla OpenAI → mock visible (no prod salvo decisión explícita) |
| `OPENAI_INPUT_USD_PER_1M` / `OPENAI_OUTPUT_USD_PER_1M` | — | Estimación de costo; si faltan → `null` |
| `GOODTRADING_AI_ALLOW_PAID_SMOKE` | — | Solo smoke manual pagado |

**Nunca** exponer `OPENAI_API_KEY` en `/api/runtime/features`, frontend, errores ni logs.

## Local (PowerShell)

```powershell
$env:GOODTRADING_AI_ENABLED = "true"
$env:GOODTRADING_AI_PROVIDER = "openai"
$env:OPENAI_API_KEY = "sk-..."   # pegar solo en la sesión; no en commits ni chats
$env:OPENAI_MODEL = "gpt-4.1-mini"
npm run dev
```

Tests (sin red / sin saldo):

```powershell
npm run test:goodtrading-ai
npm run test:goodtrading-ai:evals
npm run goodtrading-ai:calibration:test
```

Smoke pagado (manual, fuera de CI):

```powershell
$env:GOODTRADING_AI_ALLOW_PAID_SMOKE = "true"
$env:GOODTRADING_AI_PROVIDER = "openai"
$env:OPENAI_API_KEY = "sk-..."
$env:GOODTRADING_AI_ENABLED = "true"
npm run goodtrading-ai:openai:smoke
```

## Railway / staging / prod

1. Setear `GOODTRADING_AI_ENABLED=true` solo cuando el Mentors deba estar visible.
2. Staging: `GOODTRADING_AI_PROVIDER=openai` + `OPENAI_API_KEY` en secrets del servicio.
3. Prod: mismo patrón; **no** activar `GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK` salvo decisión explícita.
4. Rotar key: crear nueva en OpenAI → actualizar secret Railway → reiniciar → revocar la anterior.
5. Healthcheck interno (admin): `GET /api/internal/ai/provider/status` — no hace llamada paga; no devuelve la key.

## Fallback a mock

- Default: fallo OpenAI → error tipado + UI de reintento (`OPENAI_*` / `PROVIDER_CONFIGURATION_ERROR`).
- Solo con `GOODTRADING_AI_OPENAI_FALLBACK_TO_MOCK=true`: respuesta `mocked:true` + warning visible en UI.

## ChatGPT Plus ≠ backend

Una suscripción **ChatGPT Plus** no autentica ni factura el backend. El Mentors usa la **API de OpenAI** (billing de plataforma / proyecto API), separada de ChatGPT consumer.

## Seguridad

- No pegar API keys en Cursor, chats, PRs ni commits.
- Logs redactados: `requestId`, provider, model, duración, tokens, categoría de error, conteo (y opcionalmente IDs) de knowledge — nunca prompt completo en prod.
- `store: false` siempre en Mentors.

## Archivos clave

- `server/ai/goodTradingAi/openaiProvider.ts`
- `server/ai/goodTradingAi/openaiConfig.ts`
- `server/ai/goodTradingAi/openai/*` (client, fake, prompt, schema, normalize)
- `server/ai/goodTradingAi/provider.ts` (factory)
- `server/routes/aiProviderStatus.routes.ts`
- `docs/goodtrading-ai-openai-provider.md` (este archivo)
