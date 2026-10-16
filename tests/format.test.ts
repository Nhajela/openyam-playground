import { describe, expect, it } from "vitest";
import { checkFormat } from "@/lib/arm/format";
import { decodeLocal, encodeLocal } from "@/lib/codec";
import { validate, withCaps, sample, type Playable } from "@/lib/arm/playable";
import { ENVELOPE } from "@/lib/arm/envelope";

const base: Playable = { name: "x", keyframes: [{ t: 0, q: [0, 0.5, 0.8, 0, 0, 0] }, { t: 2, q: [0, 0.6, 0.9, 0, 0, 0] }] };

describe("format/version gate (matches armctl compat())", () => {
  it.each([
    [{}, "legacy"],
    [{ format: "openyam-playable", version: "1.0" }, "ok"],
    [{ format: "openyam-playable", version: "1.7" }, "ok"],
    [{ format: "openyam-playable", version: "2.0" }, "refused"],
    [{ format: "openyam-playable", version: "1" }, "refused"],
    [{ format: "openyam-playable", version: 1.0 }, "refused"],
    [{ format: "openyam-playable" }, "refused"],
    [{ version: "1.0" }, "refused"],
    [{ format: "other", version: "1.0" }, "refused"],
  ])("%j -> %s", (extra, status) => {
    expect(checkFormat({ ...base, ...extra }).status).toBe(status);
    expect(validate({ ...base, ...extra } as Playable).ok).toBe(status !== "refused");
  });
});

describe("offline share link", () => {
  it("keeps format, version and caps through encode/decode", () => {
    const p = { ...base, format: "openyam-playable", version: "1.0", caps: "dance", author: "me" } as Playable;
    const back = decodeLocal(encodeLocal({ v: 1, playable: p })).playable;
    expect(back.format).toBe("openyam-playable");
    expect(back.version).toBe("1.0");
    expect(back.caps).toBe("dance");
    expect(back.author).toBeUndefined();
  });
});

describe("caps presets", () => {
  it("withCaps swaps the caps and restores them", () => {
    const seen = withCaps({ ...base, caps: "dance" }, () => [ENVELOPE.velCap[0], ENVELOPE.accCap[0]]);
    expect(seen).toEqual([0.6, 2.0]);
    expect(ENVELOPE.velCap).toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
    expect(ENVELOPE.accCap).toEqual([1, 1, 1, 1, 1, 1]);
  });
  it("dance caps shorten the start transition", () => {
    const off = { ...base, keyframes: [{ t: 0, q: [0.8, 0.5, 0.8, 0, 0, 0] }, { t: 2, q: [0.8, 0.6, 0.9, 0, 0, 0] }] };
    const d1 = sample(off).duration;
    const d2 = withCaps({ ...off, caps: "dance" }, () => sample(off)).duration;
    expect(d2).toBeLessThan(d1);
  });
  it("unknown preset is a schema violation", () => {
    const r = validate({ ...base, caps: "turbo" });
    expect(r.ok).toBe(false);
    expect(r.violations[0].msg).toBe("unknown caps preset 'turbo'");
  });
});
