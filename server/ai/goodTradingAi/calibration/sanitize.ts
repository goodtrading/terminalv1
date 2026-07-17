/** Strip/limit untrusted Ignacio text — content, not executable instructions. */
export function sanitizeEditorialText(input: string, max: number): string {
  let s = String(input ?? "");
  // strip HTML tags
  s = s.replace(/<[^>]*>/g, "");
  // neutralize path-like and code fences somewhat
  s = s.replace(/\.\.[/\\]/g, "");
  s = s.replace(/```/g, "'''");
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  s = s.trim();
  if (s.length > max) s = s.slice(0, max);
  return s;
}

/** Wrap for future LLM prompts — delimiter only, no execution. */
export function delimitIgnacioAnswer(answer: string): string {
  return `<<<IGNACIO_ANSWER>>>\n${sanitizeEditorialText(answer, 8000)}\n<<<END_IGNACIO_ANSWER>>>`;
}
