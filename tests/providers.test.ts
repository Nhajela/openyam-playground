import { describe, expect, it } from "vitest";
import { geminiProvider } from "@/lib/llm/providers/gemini";
import { openrouterProvider } from "@/lib/llm/providers/openrouter";

type Call = { url: string; init: RequestInit };
function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const PL = { name: "x", space: "joint", start: "ready", keyframes: [], loop: 1, speed: 1, notes: "" };
const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("gemini (Vertex) provider", () => {
  it("calls the project-scoped Vertex endpoint with x-goog-api-key and a response schema", async () => {
    const { f, calls } = fakeFetch([{ status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(PL) }] } }] } }]);
    const p = geminiProvider(env({ GEMINI_API_KEY: "vk", GOOGLE_CLOUD_PROJECT: "proj-1", GEMINI_MODEL: "gemini-2.5-flash" }), f);
    expect(await p.complete("sys", "user")).toEqual(PL);
    expect(calls[0].url).toBe("https://aiplatform.googleapis.com/v1/projects/proj-1/locations/global/publishers/google/models/gemini-2.5-flash:generateContent");
    expect((calls[0].init.headers as Record<string, string>)["x-goog-api-key"]).toBe("vk");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema.type).toBe("OBJECT");
    expect(calls[0].url).not.toContain("generativelanguage");
  });
  it("express mode without a project; errors are readable", async () => {
    const { f, calls } = fakeFetch([{ status: 403, body: { error: { message: "denied" } } }]);
    const p = geminiProvider(env({ GEMINI_API_KEY: "vk" }), f);
    await expect(p.complete("s", "u")).rejects.toThrow(/Gemini \(Vertex\) error 403/);
    expect(calls[0].url).toBe("https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent");
  });
});

describe("openrouter provider", () => {
  it("sends json_schema, falls back to json_object on 400", async () => {
    const { f, calls } = fakeFetch([
      { status: 400, body: { error: { message: "json_schema unsupported" } } },
      { status: 200, body: { choices: [{ message: { content: "```json\n" + JSON.stringify(PL) + "\n```" } }] } },
    ]);
    const p = openrouterProvider(env({ OPENROUTER_API_KEY: "ok", OPENROUTER_MODEL: "a/b" }), f);
    expect(await p.complete("sys", "user")).toEqual(PL);
    expect(calls[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer ok");
    const b0 = JSON.parse(calls[0].init.body as string);
    expect(b0.model).toBe("a/b");
    expect(b0.response_format.type).toBe("json_schema");
    expect(b0.messages[0]).toEqual({ role: "system", content: "sys" });
    expect(JSON.parse(calls[1].init.body as string).response_format).toEqual({ type: "json_object" });
  });
  it("reports refusals", async () => {
    const { f } = fakeFetch([{ status: 200, body: { choices: [{ message: { content: null, refusal: "no" } }] } }]);
    await expect(openrouterProvider(env({ OPENROUTER_API_KEY: "k" }), f).complete("s", "u")).rejects.toThrow(/declined/);
  });
});
