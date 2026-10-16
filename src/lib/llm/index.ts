import { anthropicProvider } from "./providers/anthropic";
import { geminiProvider } from "./providers/gemini";
import { mockProvider } from "./providers/mock";
import { openrouterProvider } from "./providers/openrouter";
import { LLMError, type LLMProvider } from "./types";

export const PROVIDERS = ["anthropic", "gemini", "openrouter", "mock"] as const;

/**
 * Pick the provider from env. LLM_PROVIDER wins; MOCK_LLM=1 means mock; otherwise the first
 * provider with a key, in the order anthropic, gemini, openrouter. Throws a clear error if none.
 */
export function getProvider(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const want = (env.LLM_PROVIDER || "").toLowerCase().trim();
  const truthy = (v?: string) => !!v && v !== "0" && v.toLowerCase() !== "false";
  const pick = want || (truthy(env.MOCK_LLM) ? "mock" : env.ANTHROPIC_API_KEY ? "anthropic" : env.GEMINI_API_KEY ? "gemini" : env.OPENROUTER_API_KEY ? "openrouter" : "");
  switch (pick) {
    case "mock":
      return mockProvider();
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new LLMError("LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set");
      return anthropicProvider(env);
    case "gemini":
      if (!env.GEMINI_API_KEY && !env.GOOGLE_API_KEY) throw new LLMError("LLM_PROVIDER=gemini but GEMINI_API_KEY is not set");
      return geminiProvider(env);
    case "openrouter":
      if (!env.OPENROUTER_API_KEY) throw new LLMError("LLM_PROVIDER=openrouter but OPENROUTER_API_KEY is not set");
      return openrouterProvider(env);
    case "":
      throw new LLMError("No LLM configured: set LLM_PROVIDER plus ANTHROPIC_API_KEY, GEMINI_API_KEY (+ GOOGLE_CLOUD_PROJECT) or OPENROUTER_API_KEY, or MOCK_LLM=1 for local development");
    default:
      throw new LLMError(`Unknown LLM_PROVIDER '${want}' (use one of ${PROVIDERS.join(", ")})`);
  }
}

export { LLMError };
export type { LLMProvider };
