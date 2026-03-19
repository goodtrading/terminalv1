const OPENAI_BASE_URL = "https://api.openai.com/v1";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function extractResponsesText(data: any): string | null {
  // Responses API typically returns something like:
  // { output: [ { content: [ { type: "output_text", text: "..." } ] } ] }
  const output = data?.output;
  if (Array.isArray(output)) {
    const texts: string[] = [];
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === "output_text" && isNonEmptyString(c?.text)) texts.push(c.text.trim());
      }
    }
    if (texts.length > 0) return texts.join("\n\n");
  }

  // Fallback: find any { text: string } occurrences under output.
  try {
    const maybeText = JSON.stringify(data);
    if (typeof maybeText === "string" && maybeText.length > 0) return maybeText.slice(0, 2000);
  } catch {
    // ignore
  }

  return null;
}

export async function callOpenAiResponses(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const { apiKey, model, systemPrompt, userPrompt } = params;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const resp = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`OpenAI request failed (${resp.status}): ${text || "no body"}`);
    }

    const data = await resp.json().catch(() => ({}));
    const extracted = extractResponsesText(data);
    if (extracted) return extracted;

    // Last resort: stringify some shape.
    return JSON.stringify(data, null, 2).slice(0, 4000);
  } finally {
    clearTimeout(timeout);
  }
}

