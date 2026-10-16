import { pickSample, toPlayable } from "../../arm/samples";
import type { LLMProvider } from "../types";

/** MOCK_LLM=1: returns sample playables picked by keyword, after a short fake delay. */
export function mockProvider(delayMs = Number(process.env.MOCK_LLM_DELAY_MS ?? 600)): LLMProvider {
  return {
    id: "mock",
    model: "mock",
    async complete(_system, user) {
      const m = user.match(/<<<\n([\s\S]*?)\n>>>/);
      const request = m ? m[1] : user;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return toPlayable(pickSample(request));
    },
  };
}
