// Integration test for the Postgres store; runs only when TEST_DATABASE_URL is set, e.g.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/playground npm test
import { describe, expect, it } from "vitest";
import { postgresStore } from "@/lib/store/postgres";
import { MOCK_SAMPLES, toPlayable } from "@/lib/arm/samples";
import { newId } from "@/lib/ids";

const url = process.env.TEST_DATABASE_URL;

describe.runIf(!!url)("postgres store", () => {
  it("insert / get / publish / list / count", async () => {
    const s = postgresStore(url!);
    const id = newId();
    const ip = `test-${id}`;
    const row = await s.insert({ id, prompt: "pg test <b>", playable: toPlayable(MOCK_SAMPLES[0]), validation: { ok: true, validation: { duration: 13.4 } }, model: "mock:mock", ip_hash: ip, status: "draft" });
    expect(row.id).toBe(id);
    expect(typeof row.created_at).toBe("string");
    const got = await s.get(id);
    expect(got!.playable.keyframes.length).toBe(MOCK_SAMPLES[0].keyframes.length);
    expect(got!.prompt).toBe("pg test <b>");
    expect((await s.listPublished(500)).some((r) => r.id === id)).toBe(false);
    await s.setStatus(id, "published");
    expect((await s.listPublished(500)).some((r) => r.id === id)).toBe(true);
    expect(await s.countSince(ip, new Date(Date.now() - 60_000))).toBe(1);
    expect(await s.exists(id)).toBe(true);
    expect(await s.get("nope00")).toBeNull();
  });
});
