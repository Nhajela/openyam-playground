export interface LLMProvider {
  /** "anthropic" | "gemini" | "openrouter" | "mock" | test ids */
  id: string;
  model: string;
  /** Return the model's JSON object (already parsed). Throw LLMError on failure. */
  complete(system: string, user: string): Promise<unknown>;
}

export class LLMError extends Error {}

export function parseJsonLoose(text: string): unknown {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (fence) s = fence[1];
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0) throw new LLMError(`no JSON object in model output: ${s.slice(0, 200)}`);
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch (e) {
    throw new LLMError(`model output is not valid JSON: ${(e as Error).message}`);
  }
}

/** Abort signal that fires after `ms` without keeping the process alive. */
export function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new Error(`timed out after ${ms / 1000}s`)), ms) as unknown as { unref?: () => void };
  t.unref?.();
  return c.signal;
}
