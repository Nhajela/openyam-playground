import { describe, expect, it } from "vitest";
import ref from "./fixtures/python-reference.json";
import { checkGeometry, forwardKinematics, jointEffects, tipPosition } from "@/lib/arm/kinematics";
import { sample, type Playable } from "@/lib/arm/playable";

describe("forward kinematics vs pinocchio (frame gripper_tip)", () => {
  it("home and ready match the lab numbers", () => {
    const home = tipPosition([0, 0, 0, 0, 0, 0]);
    const ready = tipPosition([0, 0.5, 0.8, 0, 0, 0]);
    expect(home[0]).toBeCloseTo(0.211, 3);
    expect(home[1]).toBeCloseTo(0, 3);
    expect(home[2]).toBeCloseTo(0.174, 3);
    expect(ready[0]).toBeCloseTo(0.205, 3);
    expect(ready[1]).toBeCloseTo(0, 3);
    expect(ready[2]).toBeCloseTo(0.432, 3);
  });
  for (const c of ref.fk) {
    it(`${c.name} within 0.1 mm`, () => {
      const f = forwardKinematics(c.q);
      f.tip.forEach((v, i) => expect(Math.abs(v - c.tip[i])).toBeLessThan(1e-4));
      const g = [f.gripper[3], f.gripper[7], f.gripper[11]];
      g.forEach((v, i) => expect(Math.abs(v - c.gripper[i])).toBeLessThan(1e-4));
    });
  }
  it("joint effect table: from ready, +j3 raises the tip and pulls it back", () => {
    const e = jointEffects([0, 0.5, 0.8, 0, 0, 0]);
    expect(e[2].dz).toBeGreaterThan(0.05);
    expect(e[2].dx).toBeLessThan(-0.03);
    expect(e[1].dz).toBeLessThan(0); // +j2 alone: forward and down
    expect(e[1].dx).toBeGreaterThan(0);
    expect(Math.abs(e[5].dx) + Math.abs(e[5].dy) + Math.abs(e[5].dz)).toBeLessThan(1e-3); // j6 spins in place
  });
});

describe("geometry check", () => {
  const P = (kfs: number[][], ts: number[]): Playable => ({ name: "g", start: "ready", keyframes: kfs.map((q, i) => ({ t: ts[i], q, grip: 0, ease: "cubic" })) });
  it("the lab's graceful bow never goes below the ready height", () => {
    const bow = ref.validate.find((v) => v.name === "graceful-bow")!.playable as unknown as Playable;
    const s = sample(bow);
    const g = checkGeometry(s, bow.keyframes);
    expect(g.ok).toBe(true);
    expect(g.min_z).toBeGreaterThan(0.43);
  });
  it("flags a tip below the table plane", () => {
    const ready = [0, 0.5, 0.8, 0, 0, 0];
    const low = [0, 2.0, 0.6, 0.0, 0, 0];
    const p = P([ready, low, ready], [0, 8, 16]);
    const g = checkGeometry(sample(p), p.keyframes);
    expect(tipPosition(low)[2]).toBeLessThan(0.05);
    expect(g.ok).toBe(false);
    expect(g.violations[0].kind).toBe("tip_below_table");
  });
  it("flags a tip far behind the base", () => {
    const ready = [0, 0.5, 0.8, 0, 0, 0];
    const back = [0, 0.2, 2.6, 0, 0, 0];
    expect(tipPosition(back)[0]).toBeLessThan(-0.1);
    const p = P([ready, back, ready], [0, 12, 24]);
    const g = checkGeometry(sample(p), p.keyframes);
    expect(g.violations.map((v) => v.kind)).toContain("tip_behind_base");
  });
});
