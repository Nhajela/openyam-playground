import { forwardKinematics } from "@/lib/arm/kinematics";
import { POSES } from "@/lib/arm/envelope";
import type { Playable } from "@/lib/arm/playable";

/** Tiny side-view stick figure of the playable's most expressive keyframe (server-rendered SVG). */
export default function ArmGlyph({ playable, className }: { playable: Playable; className?: string }) {
  const ready = POSES.ready;
  let best: number[] = ready;
  let score = -1;
  for (const k of playable.keyframes ?? []) {
    if (!Array.isArray(k.q) || k.q.length !== 6) continue;
    const s = k.q.reduce((a, v, i) => a + Math.abs(v - ready[i]), 0);
    if (s > score) { score = s; best = k.q; }
  }
  const fk = forwardKinematics(best);
  const pts = [[0, 0, 0] as number[], ...fk.jointOrigins, fk.tip];
  // oblique projection: x right, z up, y adds a little depth
  const P = (p: number[]) => [36 + (p[0] - 0.1) * 120 - p[1] * 60, 66 - p[2] * 120 + p[1] * 25];
  const d = pts.map((p, i) => `${i ? "L" : "M"}${P(p)[0].toFixed(1)} ${P(p)[1].toFixed(1)}`).join(" ");
  const tip = P(fk.tip);
  return (
    <svg className={className} viewBox="0 0 72 72" aria-hidden="true">
      <line x1="8" y1="66.5" x2="64" y2="66.5" stroke="var(--line)" strokeWidth="2" strokeLinecap="round" />
      <rect x="29" y="58" width="14" height="8" rx="3" fill="var(--muted)" />
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={tip[0]} cy={tip[1]} r="3.5" fill="var(--accent)" />
    </svg>
  );
}
