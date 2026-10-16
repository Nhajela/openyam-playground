import { PLAYABLE_SCHEMA } from "../schema";
import { LLMError, parseJsonLoose, type LLMProvider } from "../types";

/**
 * OpenRouter (OpenAI-compatible chat completions, https://openrouter.ai/api/v1).
 * Asks for json_schema output; if the routed model rejects that, retries with json_object.
 */
export function openrouterProvider(env = process.env, fetchImpl: typeof fetch = fetch): LLMProvider {
  const model = env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5";
  const base = (env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const call = async (system: string, user: string, format: object) => {
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": env.PUBLIC_BASE_URL || "https://openyam-playground.local",
        "X-Title": "OpenYAM Playground",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        response_format: format,
        max_tokens: 8000,
      }),
      signal: AbortSignal.timeout(90_000),
    }).catch((e: Error) => { throw new LLMError(`OpenRouter request failed: ${e.message}`); });
    return { status: res.status, body: await res.text() };
  };
  return {
    id: "openrouter",
    model,
    async complete(system, user) {
      let r = await call(system, user, { type: "json_schema", json_schema: { name: "playable", strict: true, schema: PLAYABLE_SCHEMA } });
      if (r.status === 400 || r.status === 422) r = await call(system, user, { type: "json_object" });
      if (r.status < 200 || r.status >= 300) throw new LLMError(`OpenRouter error ${r.status}: ${r.body.slice(0, 300)}`);
      let data: { choices?: { message?: { content?: string | null; refusal?: string | null } }[]; error?: { message?: string } };
      try { data = JSON.parse(r.body); } catch { throw new LLMError("OpenRouter returned non-JSON"); }
      if (data.error) throw new LLMError(`OpenRouter: ${data.error.message ?? "error"}`);
      const msg = data.choices?.[0]?.message;
      if (msg?.refusal) throw new LLMError("the model declined this request");
      if (!msg?.content) throw new LLMError("OpenRouter returned no content");
      return parseJsonLoose(msg.content);
    },
  };
}
