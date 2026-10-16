import Anthropic from "@anthropic-ai/sdk";
import { PLAYABLE_SCHEMA } from "../schema";
import { LLMError, type LLMProvider } from "../types";

/**
 * Claude via the official SDK with structured output (output_config.format json_schema).
 * Server-side refusal fallbacks are on by default (ANTHROPIC_FALLBACKS=0 turns them off).
 */
export function anthropicProvider(env = process.env): LLMProvider {
  const model = env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 90_000, maxRetries: 1 });
  const fallbacks = env.ANTHROPIC_FALLBACKS !== "0";
  const effort = env.ANTHROPIC_EFFORT as "low" | "medium" | "high" | undefined;
  return {
    id: "anthropic",
    model,
    async complete(system, user) {
      let resp;
      try {
        resp = await client.beta.messages.create({
          model,
          max_tokens: 16000,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { format: { type: "json_schema", schema: PLAYABLE_SCHEMA as unknown as Record<string, unknown> }, ...(effort ? { effort } : {}) },
          ...(fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
      } catch (e) {
        if (e instanceof Anthropic.RateLimitError) throw new LLMError("Claude is rate limited, try again in a minute");
        if (e instanceof Anthropic.APIError) throw new LLMError(`Claude API error ${e.status ?? ""}: ${e.message}`);
        throw new LLMError(`Claude request failed: ${(e as Error).message}`);
      }
      if (resp.stop_reason === "refusal") throw new LLMError("the model declined this request");
      const block = resp.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") throw new LLMError("no text in Claude response");
      try {
        return JSON.parse(block.text);
      } catch {
        throw new LLMError("Claude returned invalid JSON");
      }
    },
  };
}
