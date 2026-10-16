import { describe, expect, it } from "vitest";
import { authorPlayable, cleanPrompt, normalize } from "@/lib/llm/author";
import { systemPrompt } from "@/lib/llm/prompt";
import { getProvider } from "@/lib/llm";
import { mockProvider } from "@/lib/llm/providers/mock";
import type { LLMProvider } from "@/lib/llm/types";
import { MOCK_SAMPLES, toPlayable } from "@/lib/arm/samples";
import { checkPlayable } from "@/lib/arm/check";
import { tipPosition } from "@/lib/arm/kinematics";

const R = [0, 0.5, 0.8, 0, 0, 0];

function scripted(responses: unknown[]): LLMProvider & { calls: { system: string; user: string }[] } {
  const calls: { system: string; user: string }[] = [];
  return {
    id: "scripted", model: "scripted-1", calls,
    async complete(system, user) {
      calls.push({ system, user });
      const r = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}
const pl = (kfs: [number, number[], number?][], extra: object = {}) => ({ name: "Test Move!", space: "joint", start: "ready", loop: 1, speed: 1, notes: "n", keyframes: kfs.map(([t, q, g]) => ({ t, q, grip: g ?? 0, ease: "cubic" })), ...extra });

describe("mock samples", () => {
  for (const s of MOCK_SAMPLES) {
    it(`${s.name} is valid and geometrically safe`, () => {
      const c = checkPlayable(toPlayable(s));
      expect(c.validation.violations).toEqual([]);
      expect(c.geometry?.ok).toBe(true);
    });
  }
  it("the mock bow really lowers the tip", () => {
    const bow = MOCK_SAMPLES.find((s) => s.name === "graceful-bow")!;
    const zs = bow.keyframes.map((k) => tipPosition(k.q)[2]);
    expect(Math.min(...zs)).toBeLessThan(tipPosition(R)[2] - 0.08);
  });
});

describe("authorPlayable", () => {
  it("valid first time: one call", async () => {
    const p = scripted([pl([[0, R], [3, [0.3, 0.5, 0.8, 0, 0, 0]], [6, R]])]);
    const r = await authorPlayable("look left", p);
    expect(r.ok).toBe(true);
    expect(p.calls.length).toBe(1);
    expect(r.playable!.name).toBe("test-move");
    expect(r.playable!.author).toBe("llm:scripted-1");
    expect(p.calls[0].system).toContain("soft limits");
    expect(p.calls[0].user).toContain("look left");
  });

  it("repairs out-of-range keyframes, feeding violations and tip positions back", async () => {
    const bad = pl([[0, R], [4, [0, 0.5, 0.8, 1.6, 0, 0]], [8, R]]);
    const good = pl([[0, R], [4, [0, 0.5, 0.8, 0.6, 0, 0]], [8, R]]);
    const p = scripted([bad, good]);
    const r = await authorPlayable("nod hard", p);
    expect(r.ok).toBe(true);
    expect(r.attempts.map((a) => a.round)).toEqual(["initial", "repair-1"]);
    expect(r.attempts[0].kinds).toContain("keyframe_out_of_range");
    expect(p.calls[1].user).toContain("REJECTED");
    expect(p.calls[1].user).toMatch(/j4 1\.600 > soft limit 1\.471/);
    expect(p.calls[1].user).toContain("tip (");
  });

  it("repairs a tip below the table (geometry feedback)", async () => {
    const low = pl([[0, R], [8, [0, 2.0, 0.6, 0, 0, 0]], [16, R]]);
    const ok = pl([[0, R], [5, [0, 1.2, 0.8, 0.4, 0, 0]], [10, R]]);
    const p = scripted([low, ok]);
    const r = await authorPlayable("touch the table", p);
    expect(r.attempts[0].kinds).toContain("tip_below_table");
    expect(p.calls[1].user).toContain("table safety plane");
    expect(r.ok).toBe(true);
  });

  it("gives up after 3 repair rounds (4 calls)", async () => {
    const bad = pl([[0, R], [4, [0, 0.5, 0.8, 1.6, 0, 0]], [8, R]]);
    const p = scripted([bad]);
    const r = await authorPlayable("x", p);
    expect(p.calls.length).toBe(4);
    expect(r.ok).toBe(false);
    expect(r.validation.violations.length).toBeGreaterThan(0);
  });

  it("retimes when only speed violations remain", async () => {
    const fast = pl([[0, R], [0.8, [0.4, 0.5, 0.8, 0, 0, 0]], [1.6, R]]);
    const p = scripted([fast]);
    const r = await authorPlayable("spin quickly", p, 1);
    expect(p.calls.length).toBe(2);
    expect(r.retimed).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.playable!.keyframes[2].t).toBeGreaterThan(3);
  });

  it("reports provider errors", async () => {
    const p = scripted([new Error("boom")]);
    const r = await authorPlayable("x", p);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("boom");
  });

  it("mock provider picks by keyword and is valid", async () => {
    const r = await authorPlayable("do a little victory dance", mockProvider(0));
    expect(r.ok).toBe(true);
    expect(r.playable!.name).toBe("victory-dance");
    const b = await authorPlayable("take a bow", mockProvider(0));
    expect(b.playable!.name).toBe("graceful-bow");
  });
});

describe("normalize / cleanPrompt / provider selection", () => {
  it("drops unknown fields and sanitizes notes", () => {
    const p = normalize({ name: "<b>X</b>", notes: "hi\u0000there", evil: "<script>", keyframes: [{ t: "0", q: [0, 0.5, 0.8, 0, 0, 0], extra: 1 }] }, "req", "m");
    expect((p as Record<string, unknown>).evil).toBeUndefined();
    expect(p.name).toBe("b-x-b");
    expect(p.notes).toBe("hi there");
    expect(p.keyframes[0]).toEqual({ t: 0, q: [0, 0.5, 0.8, 0, 0, 0], ease: "cubic" });
  });
  it("cleanPrompt strips control characters and whitespace", () => {
    expect(cleanPrompt("  wave\n\n hello" + String.fromCharCode(0x202e) + " ")).toBe("wave hello");
    expect(cleanPrompt(42)).toBe("");
  });
  it("getProvider", () => {
    expect(() => getProvider({} as NodeJS.ProcessEnv)).toThrow(/No LLM configured/);
    expect(getProvider({ MOCK_LLM: "1" } as unknown as NodeJS.ProcessEnv).id).toBe("mock");
    expect(getProvider({ ANTHROPIC_API_KEY: "k" } as unknown as NodeJS.ProcessEnv).model).toBe("claude-sonnet-5-5");
    expect(getProvider({ LLM_PROVIDER: "gemini", GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-x" } as unknown as NodeJS.ProcessEnv).model).toBe("gemini-x");
    expect(getProvider({ OPENROUTER_API_KEY: "k", OPENROUTER_MODEL: "a/b" } as unknown as NodeJS.ProcessEnv).id).toBe("openrouter");
    expect(() => getProvider({ LLM_PROVIDER: "openrouter" } as unknown as NodeJS.ProcessEnv)).toThrow(/OPENROUTER_API_KEY/);
    expect(() => getProvider({ LLM_PROVIDER: "gpt" } as unknown as NodeJS.ProcessEnv)).toThrow(/Unknown/);
  });
  it("system prompt contains geometry", () => {
    const s = systemPrompt();
    expect(s).toContain("(0.205, 0.000, 0.432)");
    expect(s).toContain("(0.211, 0.000, 0.174)");
    expect(s).toMatch(/\+0\.3 rad on j3: tip moves up \d+ mm, back/);
    expect(s).toContain("untrusted");
  });
});
