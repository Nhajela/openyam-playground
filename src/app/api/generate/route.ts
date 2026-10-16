import { NextResponse } from "next/server";
import { authorPlayable, cleanPrompt, MAX_PROMPT_CHARS } from "@/lib/llm/author";
import { getProvider, LLMError } from "@/lib/llm";
import { getStore } from "@/lib/store";
import { clientIp, hashIp, newId } from "@/lib/ids";
import { rateLimitPerHour, takeToken } from "@/lib/ratelimit";
import { encodeLocal } from "@/lib/codec";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Vercel: LLM + up to 3 repair rounds

export async function POST(req: Request) {
  let body: { prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError(400, "send JSON: {\"prompt\": \"...\"}");
  }
  const prompt = cleanPrompt(body.prompt);
  if (!prompt) return jsonError(400, "Type what the arm should do.");
  if (prompt.length > MAX_PROMPT_CHARS) return jsonError(400, `Keep it under ${MAX_PROMPT_CHARS} characters.`);

  const ipHash = hashIp(clientIp(req.headers));
  const store = getStore();
  const limit = rateLimitPerHour();
  const tok = takeToken(ipHash, limit);
  let dbCount = 0;
  if (store.kind === "postgres") {
    try {
      dbCount = await store.countSince(ipHash, new Date(Date.now() - 3_600_000));
    } catch (e) {
      console.error("rate-limit count failed", e);
    }
  }
  if (!tok.ok || dbCount >= limit) {
    return jsonError(429, `That's ${limit} motions this hour from your network. Take a break and try again soon.`, {}, { "Retry-After": String(tok.retryAfterS || 600) });
  }

  let provider;
  try {
    provider = getProvider();
  } catch (e) {
    return jsonError(503, e instanceof LLMError ? e.message : "LLM not configured");
  }

  const result = await authorPlayable(prompt, provider);
  if (!result.playable) {
    console.error("generate failed", result.error);
    return jsonError(502, `The motion writer had a problem: ${result.error ?? "unknown error"}. Please try again.`);
  }

  const id = newId();
  const stored = {
    ok: result.ok,
    validation: { ...result.validation, violations: result.validation.violations.slice(0, 50) },
    geometry: result.geometry,
    attempts: result.attempts,
    retimed: result.retimed,
    provider: result.provider,
    latency_s: result.latency_s,
  };
  try {
    await store.insert({ id, prompt, playable: result.playable, validation: stored, model: `${result.provider}:${result.model}`, ip_hash: ipHash, status: result.ok ? "draft" : "invalid" });
  } catch (e) {
    console.error("store insert failed", e);
    return NextResponse.json({ ...stored, id: null, prompt, playable: result.playable, model: result.model, local: result.ok ? encodeLocal({ v: 1, prompt, playable: result.playable }) : null, store_error: "Could not save right now; the offline link still works." });
  }
  return NextResponse.json({
    ...stored,
    id: result.ok ? id : null,
    prompt,
    playable: result.playable,
    model: result.model,
    local: result.ok ? encodeLocal({ v: 1, prompt, playable: result.playable }) : null,
  });
}
