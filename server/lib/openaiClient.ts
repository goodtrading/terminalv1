import OpenAI from "openai";

const systemPrompt = `
Respond in Spanish by default.
You are an institutional trading copilot: short, tactical, operator-focused.
Write like an institutional desk note (no long-form report).

Must follow:
- Respond in Spanish by default.
- Be concise and tactical. No fluff.
- Prioritize only the most relevant nearby levels and scenarios.
- Avoid generic commentary and redundancy.
- Do not overexplain obvious context.
- Do not invent missing data.
- If gammaState is explicitly provided in marketContext, treat it as source of truth.
- Avoid listing distant irrelevant levels unless directly important.

Keep the same response structure exactly (section headers must match):
RÉGIMEN:
SESGO:
NIVELES CLAVE:
ESCENARIOS:
INVALIDACIÓN:
MEJOR JUGADA:

Length guidance (keep tight):
- RÉGIMEN: 1-2 líneas max
- SESGO: 1-2 líneas max
- NIVELES CLAVE: 3-4 bullets max
- ESCENARIOS: 2-3 escenarios max
- INVALIDACIÓN: 1 frase
- MEJOR JUGADA: 1-3 frases

Gamma logic correctness:
- Do not contradict gammaState.
- You may reference spot relative to gammaFlip only to refine expected behavior if needed, but never contradict gammaState.
`;

export async function generateAIResponse({
  message,
  marketContext,
}: {
  message: string;
  marketContext?: any;
}): Promise<string> {
  const runtimeKey = process.env.OPENAI_API_KEY || "";
  // Log once per process to prove runtime env value (prefix+length only).
  const g = globalThis as any;
  if (!g.__openai_runtime_key_logged) {
    g.__openai_runtime_key_logged = true;
    console.log("[OpenAI Runtime] key prefix:", runtimeKey.slice(0, 8));
    console.log("[OpenAI Runtime] key length:", runtimeKey.length);
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const messageWithContext = `
User question:
${message}

Market context:
${JSON.stringify(marketContext ?? {}, null, 2)}
`;

    const extractOutputText = (resp: any): string | null => {
      const direct = resp?.output_text;
      if (typeof direct === "string" && direct.trim().length > 0) return direct;

      const output = resp?.output;
      if (!Array.isArray(output)) return null;

      const texts: string[] = [];
      for (const item of output) {
        const content = item?.content;
        if (!Array.isArray(content)) continue;
        for (const c of content) {
          if (c?.type === "output_text" && typeof c?.text === "string" && c.text.trim().length > 0) {
            texts.push(c.text.trim());
          }
        }
      }

      if (texts.length > 0) return texts.join("\n\n");
      return null;
    };

    const tryModel = async (model: string): Promise<string> => {
      const response = await client.responses.create({
        model,
        input: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: messageWithContext,
          },
        ],
      });

      const out = extractOutputText(response);
      if (!out || out.trim().length === 0) {
        throw new Error("EMPTY_OPENAI_RESPONSE");
      }
      return out;
    };

    const primaryModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
    try {
      const out = await tryModel(primaryModel);
      if (typeof out === "string" && out.trim().length > 0) return out;
    } catch {
      const fallbackModel = "gpt-5.4-mini";
      const out = await tryModel(fallbackModel);
      if (typeof out === "string" && out.trim().length > 0) return out;
      throw new Error("EMPTY_OPENAI_RESPONSE");
    }
  } catch (error) {
    console.error("OpenAI error:", error);
    const message = error instanceof Error ? error.message : "OpenAI call failed";
    const wrapped = new Error(message);
    // Preserve stack where possible.
    (wrapped as any).cause = error;
    throw wrapped;
  }
}

