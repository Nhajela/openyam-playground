/**
 * Playables: TypeScript port of the lab repo's armctl/playable.py (parse, interpolate,
 * validate, retime). Semantics are kept identical so a playable that passes here passes
 * the lab station's Python validator, which re-checks it before a human presses Play.
 *
 * - t is authored seconds; first keyframe at t=0; strictly increasing.
 *   Playback time = authored time / speed; speed in (0, 2].
 * - ease on keyframe k shapes the segment k-1 -> k: cubic (smoothstep, default), linear, hold.
 * - grip 0 (closed) .. 1 (open); omitted carries the previous value (first default 0).
 * - loop 1..10; loop > 1 needs last keyframe == first (0.01 rad).
 * - If keyframe 0 is more than 0.05 rad from the start pose, a cubic transition sized to
 *   half the caps is prepended; it counts towards the 60 s limit.
 * - Every keyframe and every 100 Hz sample must be in the soft box; per-joint velocity
 *   (central differences) and acceleration (second differences) under the caps.
 */
import { ENVELOPE, EPS, JOINTS, fmtG, round } from "./envelope";
import { checkFormat } from "./format";

export const RATE_HZ = 100;
export const MAX_DURATION_S = 60;
export const START_TOL = 0.05;
export const LOOP_TOL = 0.01;
export const EASES = ["linear", "cubic", "hold"] as const;
export type Ease = (typeof EASES)[number];
export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const SPEED_KINDS = new Set(["velocity", "acceleration", "grip_velocity"]);

export interface Keyframe {
  t: number;
  q: number[];
  grip?: number;
  ease?: Ease | string;
}
export interface Playable {
  name: string;
  space?: string;
  start?: string;
  keyframes: Keyframe[];
  loop?: number;
  speed?: number;
  notes?: string;
  author?: string;
  created?: string;
  prompt?: string;
  [k: string]: unknown;
}

export interface Violation {
  t: number | null;
  t_play: number | null;
  t_play_span?: [number, number];
  joint: string | null;
  kind: string;
  value: number | null;
  limit: number | null;
  segment: string | null;
  msg: string;
}

export interface Transition {
  from: string;
  duration: number;
  max_delta: number;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
  duration: number | null;
  max_vel: number[] | null;
  max_acc: number[] | null;
  max_grip_vel?: number;
  transition: Transition | null;
  envelope: string;
}

interface Key {
  t: number;
  q: number[];
  grip: number;
  ease: Ease;
}

export class SchemaError extends Error {}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const maxAbsDiff = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

export function slugify(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (s || "playable").slice(0, 64).replace(/-+$/, "") || "playable";
}

function schemaViolation(msg: string, t: number | null = null, kind = "schema"): Violation {
  return { t, t_play: null, joint: null, kind, value: null, limit: null, segment: null, msg };
}

function pyRepr(x: unknown): string {
  if (typeof x === "string") return `'${x}'`;
  if (x === undefined || x === null) return "None";
  if (typeof x === "boolean") return x ? "True" : "False";
  return JSON.stringify(x);
}

export function parse(playable: unknown): { keys: Key[]; violations: Violation[] } {
  const v: Violation[] = [];
  if (!playable || typeof playable !== "object" || Array.isArray(playable)) {
    throw new SchemaError("playable must be a JSON object");
  }
  const p = playable as Record<string, unknown>;
  if (typeof p.name !== "string" || !NAME_RE.test(p.name)) {
    v.push(schemaViolation(`name ${pyRepr(p.name)} must match ${NAME_RE.source}`));
  }
  const space = p.space ?? "joint";
  if (space === "cartesian") {
    v.push(schemaViolation("space 'cartesian' is parsed but not supported yet; use 'joint'", null, "unsupported"));
  } else if (space !== "joint") {
    v.push(schemaViolation(`space must be 'joint' or 'cartesian', got ${pyRepr(space)}`));
  }
  const start = (p.start ?? "ready") as string;
  if (typeof start !== "string" || !(start in ENVELOPE.poses)) {
    v.push(schemaViolation(`start ${pyRepr(start)} is not a named pose (${Object.keys(ENVELOPE.poses).join(", ")})`));
  }
  const loop = p.loop ?? 1;
  if (typeof loop !== "number" || !Number.isInteger(loop) || loop < 1 || loop > 10) {
    v.push(schemaViolation(`loop must be an integer 1..10, got ${pyRepr(loop)}`));
  }
  const speed = p.speed ?? 1.0;
  if (typeof speed !== "number" || !(speed > 0 && speed <= 2)) {
    v.push(schemaViolation(`speed must be a number in (0, 2], got ${pyRepr(speed)}`));
  }
  const kfs = p.keyframes;
  const keys: Key[] = [];
  if (!Array.isArray(kfs) || kfs.length === 0) {
    v.push(schemaViolation("keyframes must be a non-empty list"));
    return { keys, violations: v };
  }
  if (kfs.length > 200) {
    v.push(schemaViolation(`too many keyframes (${kfs.length} > 200)`));
    return { keys, violations: v };
  }
  let grip = 0;
  kfs.forEach((k: unknown, i: number) => {
    if (!k || typeof k !== "object" || Array.isArray(k)) {
      v.push(schemaViolation(`keyframe ${i} is not an object`));
      return;
    }
    const kk = k as Record<string, unknown>;
    const t = kk.t;
    const q = kk.q;
    if (!isNum(t)) {
      v.push(schemaViolation(`keyframe ${i}: t must be a number`));
      return;
    }
    if (!Array.isArray(q) || q.length !== 6 || !q.every(isNum)) {
      v.push(schemaViolation(`keyframe ${i} (t=${t}): q must be a list of 6 numbers (rad)`, t));
      return;
    }
    if (kk.grip !== undefined && kk.grip !== null) {
      const g = kk.grip;
      if (typeof g !== "number" || !(g >= 0 && g <= 1)) {
        v.push(schemaViolation(`keyframe ${i} (t=${t}): grip must be 0..1, got ${pyRepr(g)}`, t));
        return;
      }
      grip = g;
    }
    let ease = (kk.ease || "cubic") as string;
    if (!(EASES as readonly string[]).includes(ease)) {
      v.push(schemaViolation(`keyframe ${i} (t=${t}): ease must be one of ('linear', 'cubic', 'hold'), got ${pyRepr(ease)}`, t));
      ease = "cubic";
    }
    keys.push({ t, q: q.map(Number), grip, ease: ease as Ease });
  });
  if (keys.length && Math.abs(keys[0].t) > 1e-9) {
    v.push(schemaViolation(`first keyframe must be at t=0, got t=${keys[0].t}`, keys[0].t));
  }
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (b.t <= a.t) {
      v.push({ t: b.t, t_play: null, joint: null, kind: "non_monotonic_t", value: b.t, limit: a.t, segment: null,
        msg: `keyframe t=${b.t} is not after previous t=${a.t}` });
    }
  }
  return { keys, violations: v };
}

export interface Segment {
  t0: number;
  t1: number;
  q0: number[];
  q1: number[];
  g0: number;
  g1: number;
  ease: Ease;
  label: string;
  authoredT0: number | null;
  speed: number;
  loop: number;
  segIndex: number | null;
}

function transitionDuration(q0: number[], q1: number[]): number {
  let T = 0.5;
  for (let j = 0; j < 6; j++) {
    const d = Math.abs(q1[j] - q0[j]);
    T = Math.max(T, (1.5 * d) / (ENVELOPE.velCap[j] * 0.5), Math.sqrt((6 * d) / (ENVELOPE.accCap[j] * 0.5)));
  }
  return round(T + 0.05, 2);
}

export function timeline(playable: Playable): { segs: Segment[]; transition: Transition | null; violations: Violation[] } {
  const { keys, violations } = parse(playable);
  if (!keys.length || violations.some((x) => ["schema", "non_monotonic_t", "unsupported"].includes(x.kind))) {
    return { segs: [], transition: null, violations };
  }
  const speed = Number(playable.speed ?? 1.0);
  const loops = Number(playable.loop ?? 1);
  const startName = (playable.start ?? "ready") as string;
  const startQ = ENVELOPE.poses[startName];
  const segs: Segment[] = [];
  let t = 0;
  let transition: Transition | null = null;
  if (maxAbsDiff(keys[0].q, startQ) > START_TOL) {
    const T = transitionDuration(startQ, keys[0].q);
    segs.push({ t0: 0, t1: T, q0: [...startQ], q1: keys[0].q, g0: keys[0].grip, g1: keys[0].grip, ease: "cubic",
      label: "transition from start pose", authoredT0: null, speed: 1, loop: 0, segIndex: null });
    transition = { from: startName, duration: T, max_delta: maxAbsDiff(keys[0].q, startQ) };
    t = T;
  }
  for (let L = 0; L < loops; L++) {
    if (L > 0) {
      const gap = maxAbsDiff(keys[keys.length - 1].q, keys[0].q);
      if (gap > LOOP_TOL) {
        violations.push({ t: keys[keys.length - 1].t, t_play: null, joint: null, kind: "loop_discontinuity", value: gap,
          limit: LOOP_TOL, segment: null,
          msg: `loop=${loops} but the last keyframe differs from the first by ${gap.toFixed(3)} rad; make them equal` });
        return { segs, transition, violations };
      }
    }
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      const dt = (b.t - a.t) / speed;
      segs.push({ t0: t, t1: t + dt, q0: a.q, q1: b.q, g0: a.grip, g1: b.grip, ease: b.ease,
        label: `loop ${L + 1}: keyframe ${i - 1}->${i} (t ${fmtG(a.t)}->${fmtG(b.t)})`, authoredT0: a.t, speed, loop: L, segIndex: i });
      t += dt;
    }
  }
  if (keys.length === 1) {
    segs.push({ t0: t, t1: t, q0: keys[0].q, q1: keys[0].q, g0: keys[0].grip, g1: keys[0].grip, ease: "hold",
      label: "single keyframe", authoredT0: 0, speed, loop: 0, segIndex: 0 });
  }
  return { segs, transition, violations };
}

function shape(ease: Ease, s: number): number {
  if (ease === "linear") return s;
  if (ease === "hold") return s >= 1 ? 1 : 0;
  return s * s * (3 - 2 * s);
}

export interface Samples {
  t: number[];
  q: number[][];
  grip: number[];
  idx: number[];
}

function sampleSegments(segs: Segment[], rate: number): Samples {
  const D = segs[segs.length - 1].t1;
  const n = Math.floor(D * rate + 1e-9);
  const ts: number[] = [];
  for (let i = 0; i <= n; i++) ts.push(i / rate);
  if (ts[ts.length - 1] < D - 1e-9) ts.push(D);
  const starts = segs.map((s) => s.t0);
  const q: number[][] = [];
  const grip: number[] = [];
  const idx: number[] = [];
  let k = 0;
  for (const tt of ts) {
    // searchsorted(starts, tt, side='right') - 1, clipped
    while (k + 1 < starts.length && starts[k + 1] <= tt) k++;
    while (k > 0 && starts[k] > tt) k--;
    const sg = segs[k];
    const span = sg.t1 - sg.t0;
    const s = span <= 0 ? 1 : Math.min(Math.max((tt - sg.t0) / span, 0), 1);
    const w = shape(sg.ease, s);
    q.push(sg.q0.map((v, j) => v + w * (sg.q1[j] - v)));
    grip.push(sg.g0 + w * (sg.g1 - sg.g0));
    idx.push(k);
  }
  return { t: ts, q, grip, idx };
}

/** Interpolate the whole playback (transition + loops) at `rate` Hz. Throws SchemaError if it can't be expanded. */
export function sample(playable: Playable, rate = RATE_HZ) {
  const { segs, violations } = timeline(playable);
  if (!segs.length) throw new SchemaError(violations.map((x) => x.msg).join("; ") || "empty playable");
  const s = sampleSegments(segs, rate);
  return { t: s.t, q: s.q, grip: s.grip, duration: s.t[s.t.length - 1], rate, segments: segs };
}

/** numpy.gradient(f, x) along axis 0 with edge_order=1 (supports a non-uniform last step). */
function gradient(f: number[], x: number[]): number[] {
  const n = f.length;
  const out = new Array(n).fill(0);
  if (n < 2) return out;
  out[0] = (f[1] - f[0]) / (x[1] - x[0]);
  out[n - 1] = (f[n - 1] - f[n - 2]) / (x[n - 1] - x[n - 2]);
  for (let i = 1; i < n - 1; i++) {
    const dx1 = x[i] - x[i - 1], dx2 = x[i + 1] - x[i];
    const a = -dx2 / (dx1 * (dx1 + dx2));
    const b = (dx2 - dx1) / (dx1 * dx2);
    const c = dx1 / (dx2 * (dx1 + dx2));
    out[i] = a * f[i - 1] + b * f[i] + c * f[i + 1];
  }
  return out;
}

function runs(mask: boolean[]): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  while (i < mask.length) {
    if (mask[i]) {
      let j = i;
      while (j + 1 < mask.length && mask[j + 1]) j++;
      out.push([i, j]);
      i = j + 1;
    } else i++;
  }
  return out;
}

function authoredT(sg: Segment, tPlay: number): number | null {
  if (sg.authoredT0 === null) return null;
  return round(sg.authoredT0 + (tPlay - sg.t0) * sg.speed, 3);
}

/**
 * Named cap presets a playable may declare with "caps": [vel rad/s, acc rad/s^2]
 * (armctl/playable.py CAP_PRESETS). null = the envelope defaults (0.3 / 1.0).
 */
export const CAP_PRESETS: Record<string, [number, number] | null> = { default: null, dance: [0.6, 2.0] };

/** The cap preset a playable declares ("default" when absent); null if it names an unknown one. */
export function capPreset(playable: Playable): string | null {
  const c = (playable as { caps?: unknown }).caps ?? "default";
  return typeof c === "string" && Object.prototype.hasOwnProperty.call(CAP_PRESETS, c) ? c : null;
}

/**
 * Run fn with the velocity/acceleration caps of the playable's preset swapped into ENVELOPE
 * (like armctl's set_envelope during validate()); this also sizes the start transition.
 */
export function withCaps<T>(playable: Playable, fn: () => T): T {
  const preset = capPreset(playable);
  const caps = preset ? CAP_PRESETS[preset] : null;
  if (!caps) return fn();
  const vel = [...ENVELOPE.velCap], acc = [...ENVELOPE.accCap];
  ENVELOPE.velCap.fill(caps[0]);
  ENVELOPE.accCap.fill(caps[1]);
  try {
    return fn();
  } finally {
    vel.forEach((x, i) => { ENVELOPE.velCap[i] = x; });
    acc.forEach((x, i) => { ENVELOPE.accCap[i] = x; });
  }
}

/**
 * Validate like armctl/playable.py validate(): first the format/version gate (any 1.x, or
 * legacy with neither field), then with the cap preset the playable declares ("caps").
 */
export function validate(playable: Playable): ValidationResult {
  const fv = checkFormat(playable);
  if (fv.status === "refused" && playable && typeof playable === "object" && !Array.isArray(playable)) {
    return { ok: false, duration: null, max_vel: null, max_acc: null, transition: null, envelope: ENVELOPE.source,
      violations: [{ ...schemaViolation(fv.msg, null, "version"), limit: null, value: null }] };
  }
  if (playable && typeof playable === "object" && capPreset(playable) === null) {
    const c = (playable as { caps?: unknown }).caps;
    return { ok: false, duration: null, max_vel: null, max_acc: null, transition: null, envelope: ENVELOPE.source,
      violations: [{ ...schemaViolation(`unknown caps preset ${pyRepr(c)}`), value: null }] };
  }
  return withCaps(playable, () => validateDefault(playable));
}

/** Check a playable against the soft envelope, caps, start pose, duration and t order. */
function validateDefault(playable: Playable): ValidationResult {
  let tl;
  try {
    tl = timeline(playable);
  } catch (e) {
    return { ok: false, violations: [schemaViolation(String((e as Error).message))], duration: null, max_vel: null,
      max_acc: null, transition: null, envelope: ENVELOPE.source };
  }
  const { segs, transition, violations: viol } = tl;
  const result: ValidationResult = { ok: false, violations: viol, duration: null, max_vel: null, max_acc: null,
    transition, envelope: ENVELOPE.source };
  if (!segs.length) return result;

  const { keys } = parse(playable);
  const lo = ENVELOPE.soft.map((x) => x[0]);
  const hi = ENVELOPE.soft.map((x) => x[1]);
  const startQ = ENVELOPE.poses[(playable.start ?? "ready") as string];

  keys.forEach((k, i) => {
    for (let j = 0; j < 6; j++) {
      if (k.q[j] < lo[j] || k.q[j] > hi[j]) {
        const below = k.q[j] < lo[j];
        const lim = below ? lo[j] : hi[j];
        viol.push({ t: k.t, t_play: null, joint: JOINTS[j], kind: "keyframe_out_of_range", value: round(k.q[j], 4),
          limit: round(lim, 4), segment: `keyframe ${i}`,
          msg: `keyframe ${i} (t=${fmtG(k.t)}): ${JOINTS[j]} ${k.q[j].toFixed(3)} ${below ? "<" : ">"} soft limit ${lim.toFixed(3)}` });
      }
    }
  });
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].ease === "hold") {
      const d = maxAbsDiff(keys[i].q, keys[i - 1].q);
      if (d > 1e-6) {
        viol.push({ t: keys[i].t, t_play: null, joint: null, kind: "hold_jump", value: round(d, 4), limit: 0,
          segment: `keyframe ${i}`,
          msg: `keyframe ${i} (t=${fmtG(keys[i].t)}) has ease 'hold' but q differs from keyframe ${i - 1} by ${d.toFixed(3)} rad (would be a jump); repeat the previous q or use 'cubic'` });
      }
    }
  }

  const { t: ts, q: Q, grip: G, idx } = sampleSegments(segs, RATE_HZ);
  const dt = 1 / RATE_HZ;
  const N = ts.length;
  const D = ts[N - 1];
  result.duration = round(D, 3);
  if (D > MAX_DURATION_S) {
    viol.push({ t: null, t_play: round(D, 2), joint: null, kind: "too_long", value: round(D, 2), limit: MAX_DURATION_S,
      segment: null, msg: `playback lasts ${D.toFixed(1)} s (incl. transition, loops, speed) > ${MAX_DURATION_S.toFixed(0)} s` });
  }

  const loT = lo.map((v, j) => Math.min(v, startQ[j]));
  const hiT = hi.map((v, j) => Math.max(v, startQ[j]));
  const inTrans = idx.map((i) => segs[i].authoredT0 === null);

  const col = (j: number) => Q.map((r) => r[j]);
  const V: number[][] = [];
  const A: number[][] = [];
  for (let j = 0; j < 6; j++) {
    const f = col(j);
    V.push(gradient(f, ts));
    const a = new Array(N).fill(0);
    if (N > 2) {
      for (let i = 1; i < N - 1; i++) a[i] = (f[i + 1] - 2 * f[i] + f[i - 1]) / (dt * dt);
      a[0] = (f[1] - f[0]) / (dt * dt);
      a[N - 1] = (f[N - 2] - f[N - 1]) / (dt * dt);
    }
    A.push(a);
  }
  const Gv = N > 1 ? gradient(G, ts) : G.map(() => 0);
  result.max_vel = V.map((v) => round(Math.max(...v.map(Math.abs)), 3));
  result.max_acc = A.map((a) => round(Math.max(...a.map(Math.abs)), 3));
  result.max_grip_vel = round(Math.max(...Gv.map(Math.abs)), 3);

  const addRuns = (mask: boolean[], vals: number[], j: number | null, kind: string, limit: number | number[],
    fmt: (o: { jn: string; v: number; lim: number; when: string; seg: string; dur: number }) => string) => {
    for (const [a, b] of runs(mask)) {
      let w = a;
      for (let i = a; i <= b; i++) if (Math.abs(vals[i]) > Math.abs(vals[w])) w = i;
      const sg = segs[idx[w]];
      const lim = Array.isArray(limit) ? limit[w] : limit;
      const jn = j !== null ? JOINTS[j] : "grip";
      const at = authoredT(sg, ts[w]);
      const when = at !== null ? `t=${fmtG(at)}` : `playback ${ts[w].toFixed(2)}s`;
      viol.push({ t: at, t_play: round(ts[w], 2), t_play_span: [round(ts[a], 2), round(ts[b], 2)], joint: jn, kind,
        value: round(vals[w], 4), limit: round(lim, 4), segment: sg.label,
        msg: fmt({ jn, v: vals[w], lim, when, seg: sg.label, dur: round(ts[b] - ts[a], 2) }) });
    }
  };

  for (let j = 0; j < 6; j++) {
    const qj = col(j);
    const LOj = inTrans.map((tr) => (tr ? loT[j] : lo[j]));
    const HIj = inTrans.map((tr) => (tr ? hiT[j] : hi[j]));
    addRuns(qj.map((v, i) => v < LOj[i] - 1e-9), qj, j, "path_out_of_range", LOj,
      (o) => `${o.jn} path reaches ${o.v.toFixed(3)} < soft limit ${o.lim.toFixed(3)} at ${o.when} (${o.seg}, for ${o.dur}s)`);
    addRuns(qj.map((v, i) => v > HIj[i] + 1e-9), qj, j, "path_out_of_range", HIj,
      (o) => `${o.jn} path reaches ${o.v.toFixed(3)} > soft limit ${o.lim.toFixed(3)} at ${o.when} (${o.seg}, for ${o.dur}s)`);
    addRuns(V[j].map((v) => Math.abs(v) > ENVELOPE.velCap[j] + 1e-9), V[j], j, "velocity", ENVELOPE.velCap[j],
      (o) => `${o.jn} velocity ${o.v.toFixed(2)} rad/s exceeds cap ${o.lim.toFixed(2)} at ${o.when} (${o.seg})`);
    addRuns(A[j].map((v) => Math.abs(v) > ENVELOPE.accCap[j] + 1e-9), A[j], j, "acceleration", ENVELOPE.accCap[j],
      (o) => `${o.jn} acceleration ${o.v.toFixed(1)} rad/s^2 exceeds cap ${o.lim.toFixed(1)} at ${o.when} (${o.seg})`);
  }
  addRuns(Gv.map((v) => Math.abs(v) > ENVELOPE.gripVelCap + 1e-9), Gv, null, "grip_velocity", ENVELOPE.gripVelCap,
    (o) => `gripper speed ${o.v.toFixed(2)}/s exceeds cap ${o.lim.toFixed(2)}/s at ${o.when} (${o.seg})`);

  // Independent cross-check, as armctl.envelope.check_path does in the Python validator:
  // forward-difference velocity and second-difference acceleration on the uniform grid,
  // monotonic recovery allowed when leaving an out-of-box start pose.
  const nGrid = Math.floor(D * RATE_HZ + 1e-9) + 1;
  const startOutside = startQ.some((v, j) => v < lo[j] - 1e-9 || v > hi[j] + 1e-9);
  const mine = new Set(viol.map((x) => `${x.joint}|${x.kind === "path_out_of_range" || x.kind === "keyframe_out_of_range" ? "range" : x.kind}`));
  for (const ev of envelopeCheckPath(Q.slice(0, nGrid), dt, startOutside)) {
    if (mine.has(`${ev.joint}|${ev.kind === "soft_lower" || ev.kind === "soft_upper" ? "range" : ev.kind}`)) continue;
    viol.push({ t: null, t_play: ev.t, joint: ev.joint, kind: `envelope_${ev.kind}`, value: ev.value, limit: ev.limit,
      segment: null, msg: `armctl.envelope: ${ev.msg}` });
  }

  result.ok = viol.length === 0;
  return result;
}

interface EnvEvent { joint: string; kind: string; value: number; limit: number; t: number; msg: string }

/** Port of armctl.envelope.Envelope.check_path (at most one event per joint and kind). */
function envelopeCheckPath(arr: number[][], dt: number, fromOutside: boolean): EnvEvent[] {
  const lo = ENVELOPE.soft.map((x) => x[0]);
  const hi = ENVELOPE.soft.map((x) => x[1]);
  const outside = (v: number[]) => v.map((x, i) => Math.max(lo[i] - x, 0) + Math.max(x - hi[i], 0));
  const out: EnvEvent[] = [];
  const bad = new Map<string, { i: number; kind: string; first: number; worst: number; val: number; count: number }>();
  let prev = outside(arr[0]);
  for (let k = 0; k < arr.length; k++) {
    const o = outside(arr[k]);
    for (let i = 0; i < 6; i++) {
      if (o[i] <= EPS) continue;
      if (fromOutside && (k === 0 || o[i] <= prev[i] + EPS)) continue;
      const kind = arr[k][i] > hi[i] ? "soft_upper" : "soft_lower";
      const key = `${i}|${kind}`;
      if (!bad.has(key)) bad.set(key, { i, kind, first: k, worst: k, val: arr[k][i], count: 0 });
      const rec = bad.get(key)!;
      rec.count++;
      if (o[i] > outside(arr[rec.worst])[i]) { rec.worst = k; rec.val = arr[k][i]; }
    }
    prev = o;
  }
  for (const rec of bad.values()) {
    const lim = rec.kind === "soft_upper" ? hi[rec.i] : lo[rec.i];
    out.push({ joint: JOINTS[rec.i], kind: rec.kind, value: rec.val, limit: lim, t: rec.first * dt,
      msg: `${JOINTS[rec.i]} reaches ${rec.val.toFixed(3)} ${rec.kind === "soft_upper" ? ">" : "<"} soft limit ${lim.toFixed(3)} at t=${(rec.worst * dt).toFixed(2)} s (${rec.count} samples)` });
  }
  if (arr.length >= 2) {
    const vel = arr.slice(1).map((r, k) => r.map((x, i) => (x - arr[k][i]) / dt));
    for (let i = 0; i < 6; i++) {
      const cap = ENVELOPE.velCap[i];
      const over = vel.map((r) => Math.abs(r[i]) > cap * (1 + 1e-3) + EPS);
      if (over.some(Boolean)) {
        let k = 0;
        vel.forEach((r, kk) => { if (Math.abs(r[i]) > Math.abs(vel[k][i])) k = kk; });
        out.push({ joint: JOINTS[i], kind: "velocity", value: vel[k][i], limit: cap, t: over.indexOf(true) * dt,
          msg: `${JOINTS[i]} velocity ${Math.abs(vel[k][i]).toFixed(3)} rad/s at t=${(k * dt).toFixed(2)} s > cap ${cap.toFixed(3)} rad/s (${over.filter(Boolean).length} samples over)` });
      }
    }
    if (arr.length >= 3) {
      const acc = vel.slice(1).map((r, k) => r.map((x, i) => (x - vel[k][i]) / dt));
      for (let i = 0; i < 6; i++) {
        const cap = ENVELOPE.accCap[i];
        const over = acc.map((r) => Math.abs(r[i]) > cap * (1 + 1e-2) + EPS);
        if (over.some(Boolean)) {
          let k = 0;
          acc.forEach((r, kk) => { if (Math.abs(r[i]) > Math.abs(acc[k][i])) k = kk; });
          out.push({ joint: JOINTS[i], kind: "acceleration", value: acc[k][i], limit: cap, t: over.indexOf(true) * dt,
            msg: `${JOINTS[i]} acceleration ${Math.abs(acc[k][i]).toFixed(3)} rad/s^2 at t=${(k * dt).toFixed(2)} s > cap ${cap.toFixed(3)} rad/s^2 (${over.filter(Boolean).length} samples over)` });
        }
      }
    }
  }
  return out;
}

/**
 * Return a copy slowed down just enough to satisfy the speed caps (port of retime()).
 * Throws if non-speed violations remain or it can't converge.
 */
export function retime(playable: Playable, maxIter = 30, margin = 1.03): Playable {
  const p: Playable = JSON.parse(JSON.stringify(playable));
  for (let it = 0; it < maxIter; it++) {
    const r = validate(p);
    if (r.ok) return p;
    const other = r.violations.filter((v) => !SPEED_KINDS.has(v.kind));
    if (other.length) {
      throw new Error("retime only fixes speed violations; also: " + other.slice(0, 5).map((v) => v.msg).join("; "));
    }
    const need = new Map<number, number>();
    const kfs = p.keyframes;
    for (const v of r.violations) {
      if (v.t === null) continue;
      let k = kfs.length - 1;
      for (let i = 1; i < kfs.length; i++) if (kfs[i].t >= v.t - 1e-9) { k = i; break; }
      const ratio = Math.abs(v.value as number) / (v.limit as number);
      const f = v.kind === "velocity" || v.kind === "grip_velocity" ? ratio : Math.sqrt(ratio);
      need.set(k, Math.max(need.get(k) ?? 1, f * margin));
      if (v.kind === "acceleration" && k + 1 < kfs.length && Math.abs(kfs[k].t - v.t) < 0.02) {
        need.set(k + 1, Math.max(need.get(k + 1) ?? 1, f * margin));
      }
    }
    if (!need.size) throw new Error("retime: no stretchable segment found");
    if (Math.max(...need.values()) > 50) {
      throw new Error("retime: needs >50x slow-down (velocity step from a 'linear' or 'hold' segment?); fix the eases instead");
    }
    const oldT = kfs.map((k) => k.t);
    const newT = [0];
    for (let i = 1; i < kfs.length; i++) newT.push(newT[i - 1] + (oldT[i] - oldT[i - 1]) * (need.get(i) ?? 1));
    kfs.forEach((k, i) => { k.t = round(newT[i], 3); });
  }
  const r = validate(p);
  if (r.ok) return p;
  throw new Error("retime did not converge: " + r.violations.slice(0, 5).map((v) => v.msg).join("; "));
}

/** Group repeated violations (same kind/joint), worst first, for the LLM repair prompt and the UI. */
export function summarizeViolations(violations: Violation[], maxItems = 25): string {
  const groups = new Map<string, Violation[]>();
  for (const v of violations) {
    const key = `${v.kind}|${v.joint ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  const lines: string[] = [];
  for (const [key, vs] of groups) {
    const [kind, joint] = key.split("|");
    const sorted = [...vs].sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0));
    lines.push(`${kind}${joint ? " " + joint : ""}: ${vs.length} occurrence(s)`);
    for (const v of sorted.slice(0, 4)) lines.push(`  - ${v.msg}`);
  }
  return lines.slice(0, maxItems).join("\n");
}
