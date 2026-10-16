import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeLocal, encodeLocal } from "@/lib/codec";
import { newId, hashIp, ID_RE } from "@/lib/ids";
import { takeToken, resetRateLimits } from "@/lib/ratelimit";
import { memoryStore } from "@/lib/store/memory";
import { SCHEMA_SQL } from "@/lib/store/schema";
import { MOCK_SAMPLES, toPlayable } from "@/lib/arm/samples";

const PY = "/home/naman/openyam-robot-arm/.venv/bin/python";

describe("offline link codec", () => {
  const p = toPlayable(MOCK_SAMPLES[0]);
  it("round-trips", () => {
    const s = encodeLocal({ v: 1, prompt: "do a little victory dance", playable: p });
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeLessThan(1200);
    const d = decodeLocal("#" + s);
    expect(d.prompt).toBe("do a little victory dance");
    expect(d.playable.keyframes).toEqual(p.keyframes);
  });
  it("rejects junk", () => {
    expect(() => decodeLocal("not base64!")).toThrow();
    expect(() => decodeLocal("aGVsbG8")).toThrow();
  });
  it.runIf(existsSync(PY))("decodes with Python zlib + base64 (what the arm station does)", () => {
    const s = encodeLocal({ v: 1, prompt: "wave", playable: p });
    const out = execFileSync(PY, ["-c", "import sys,json,zlib,base64;f=sys.argv[1];d=json.loads(zlib.decompress(base64.urlsafe_b64decode(f+'='*(-len(f)%4))));print(d['playable']['name'],len(d['playable']['keyframes']))", s]).toString().trim();
    expect(out).toBe(`${p.name} ${p.keyframes.length}`);
  });
});

describe("ids, rate limit, store", () => {
  it("ids are short slugs", () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId()));
    expect(ids.size).toBe(500);
    for (const id of ids) expect(id).toMatch(ID_RE);
    expect(hashIp("1.2.3.4")).not.toContain("1.2.3.4");
  });
  it("rate limit 10/hour", () => {
    resetRateLimits();
    const now = 1_000_000;
    for (let i = 0; i < 10; i++) expect(takeToken("a", 10, 3_600_000, now + i).ok).toBe(true);
    const r = takeToken("a", 10, 3_600_000, now + 20);
    expect(r.ok).toBe(false);
    expect(r.retryAfterS).toBeGreaterThan(3500);
    expect(takeToken("a", 10, 3_600_000, now + 3_600_001).ok).toBe(true);
    expect(takeToken("b", 10, 3_600_000, now).ok).toBe(true);
  });
  it("memory store", async () => {
    const s = memoryStore();
    await s.insert({ id: "abc234", prompt: "p", playable: toPlayable(MOCK_SAMPLES[1]), validation: { ok: true }, model: "mock", ip_hash: "h", status: "draft" });
    expect(await s.listPublished(10)).toEqual([]);
    await s.setStatus("abc234", "published");
    expect((await s.listPublished(10)).map((r) => r.id)).toEqual(["abc234"]);
    expect(await s.countSince("h", new Date(Date.now() - 1000))).toBe(1);
    expect(await s.get("nope")).toBeNull();
  });
  it("embedded schema equals the migration file", () => {
    expect(SCHEMA_SQL).toBe(readFileSync("migrations/001_init.sql", "utf8"));
  });
});
