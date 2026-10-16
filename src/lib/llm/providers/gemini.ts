import { GEMINI_SCHEMA } from "../schema";
import { LLMError, parseJsonLoose, type LLMProvider } from "../types";

/**
 * Gemini on Vertex AI with an API key (the deploy key is a Vertex key that is blocked on
 * generativelanguage.googleapis.com), via the REST generateContent endpoint:
 *   https://aiplatform.googleapis.com/v1/projects/$GOOGLE_CLOUD_PROJECT/locations/$GOOGLE_CLOUD_LOCATION/publishers/google/models/$GEMINI_MODEL:generateContent
 * Without GOOGLE_CLOUD_PROJECT it uses Vertex express mode (no project in the path).
 * Plain fetch keeps the exact endpoint under our control (no SDK endpoint guessing).
 * JSON output via responseMimeType + responseSchema.
 */
export function geminiProvider(env = process.env, fetchImpl: typeof fetch = fetch): LLMProvider {
  const model = env.GEMINI_MODEL || "gemini-2.5-flash";
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || "";
  const project = env.GOOGLE_CLOUD_PROJECT;
  const location = env.GOOGLE_CLOUD_LOCATION || "global";
  const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const url = project
    ? `https://${host}/v1/projects/${encodeURIComponent(project)}/locations/${location}/publishers/google/models/${model}:generateContent`
    : `https://aiplatform.googleapis.com/v1/publishers/google/models/${model}:generateContent`;
  return {
    id: "gemini",
    model,
    async complete(system, user) {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: GEMINI_SCHEMA, temperature: 0.7, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(90_000),
      }).catch((e: Error) => { throw new LLMError(`Gemini request failed: ${e.message}`); });
      const body = await res.text();
      if (!res.ok) throw new LLMError(`Gemini (Vertex) error ${res.status}: ${body.slice(0, 300)}`);
      let data: { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
      try { data = JSON.parse(body); } catch { throw new LLMError("Gemini returned non-JSON"); }
      const cand = data.candidates?.[0];
      const text = cand?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new LLMError(`Gemini returned no content (finishReason ${cand?.finishReason ?? "?"})`);
      return parseJsonLoose(text);
    },
  };
}
