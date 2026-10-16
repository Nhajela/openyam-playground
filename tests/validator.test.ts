import { describe, expect, it } from "vitest";
import ref from "./fixtures/python-reference.json";
import { retime, sample, validate, type Playable } from "@/lib/arm/playable";
import { SOFT_LIMITS } from "@/lib/arm/envelope";

type RefV = { kind: string; joint: string | null; t: number | null; t_play: number | null; value: number | null; limit: number | null };

const key = (v: RefV) => `${v.kind}|${v.joint ?? ""}`;

describe("envelope matches the Python armctl.envelope", () => {
  it("soft limits", () => {
    const py = ref.envelope.soft_limits as number[][];
    SOFT_LIMITS.forEach(([lo, hi], j) => {
      expect(lo).toBeCloseTo(py[j][0], 9);
      expect(hi).toBeCloseTo(py[j][1], 9);
    });
    expect(ref.envelope.vel_cap).toEqual([0.3, 0.3, 0.3, 0.3, 0.3, 0.3]);
    expect(ref.envelope.acc_cap).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("validate() cross-checked against armctl/playable.py", () => {
  for (const c of ref.validate) {
    it(c.name, () => {
      const r = validate(c.playable as unknown as Playable);
      expect(r.ok).toBe(c.ok);
      if (c.duration === null) expect(r.duration).toBeNull();
      else expect(r.duration).toBeCloseTo(c.duration, 3);
      if (c.max_vel) {
        r.max_vel!.forEach((v, j) => expect(v).toBeCloseTo(c.max_vel![j], 2));
        r.max_acc!.forEach((v, j) => expect(Math.abs(v - c.max_acc![j])).toBeLessThan(0.01 + 1e-3 * c.max_acc![j]));
        expect(r.max_grip_vel!).toBeCloseTo(c.max_grip_vel as number, 2);
      }
      if (c.transition) {
        expect(r.transition!.duration).toBeCloseTo(c.transition.duration, 6);
        expect(r.transition!.from).toBe(c.transition.from);
      } else expect(r.transition).toBeNull();
      // same violations: kind, joint, count, timing and worst value
      const py = c.violations as RefV[];
      expect(r.violations.map(key).sort()).toEqual(py.map(key).sort());
      const mine = [...r.violations].sort((a, b) => key(a).localeCompare(key(b)) || (a.t_play ?? a.t ?? 0) - (b.t_play ?? b.t ?? 0));
      const theirs = [...py].sort((a, b) => key(a).localeCompare(key(b)) || (a.t_play ?? a.t ?? 0) - (b.t_play ?? b.t ?? 0));
      mine.forEach((m, i) => {
        const p = theirs[i];
        if (p.t !== null) expect(m.t).toBeCloseTo(p.t, 2);
        if (p.t_play !== null) expect(m.t_play).toBeCloseTo(p.t_play, 2);
        if (typeof p.value === "number") expect(Math.abs((m.value as number) - p.value)).toBeLessThan(1e-3 * Math.max(1, Math.abs(p.value)));
        if (typeof p.limit === "number") expect(m.limit).toBeCloseTo(p.limit, 4);
      });
    });
  }
});

describe("retime() matches Python", () => {
  for (const c of ref.retime) {
    it(c.name, () => {
      if (c.ok) {
        const p = retime(c.playable as unknown as Playable);
        const t = p.keyframes.map((k) => k.t);
        t.forEach((v, i) => expect(v).toBeCloseTo((c.t as number[])[i], 2));
        expect(validate(p).ok).toBe(true);
      } else {
        expect(() => retime(c.playable as unknown as Playable)).toThrow(/retime/);
      }
    });
  }
});

describe("sample() matches Python interpolation", () => {
  for (const c of ref.sample) {
    it(c.name, () => {
      const s = sample(c.playable as unknown as Playable);
      expect(s.t.length).toBe(c.n);
      expect(s.duration).toBeCloseTo(c.duration, 6);
      for (const pt of c.points) {
        const i = Math.round(pt.t * 100);
        const k = i < s.t.length ? i : s.t.length - 1;
        s.q[k].forEach((v, j) => expect(v).toBeCloseTo(pt.q[j], 4));
        expect(s.grip[k]).toBeCloseTo(pt.grip, 3);
      }
    });
  }
});
