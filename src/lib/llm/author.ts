/**
 * English -> validated playable (port of the lab's armctl/llm_author.author loop):
 * ask the model, validate (joint limits, caps, timing) and check geometry (FK tip above the
 * table, not behind the base); feed problems back for up to `rounds` repair rounds; if only
 * speed violations remain, retime (slow down just the offending segments).
 */
import { checkPlayable, type CheckResult } from "../arm/check";
import { fmtXYZ, tipPosition, type Vec3 } from "../arm/kinematics";
import { EASES, SPEED_KINDS, retime, slugify, summarizeViolations, type Keyframe, type Playable } from "../arm/playable";
import { repairPrompt, systemPrompt, userPrompt } from "./prompt";
import { LLMError, type LLMProvider } from "./types";

export const MAX_PROMPT_CHARS = 300;

export interface Attempt {
  round: string;
  ok?: boolean;
  n_violations?: number;
  kinds?: string[];
  latency_s?: number;
  error?: string;
}

export interface AuthorResult extends CheckResult {
  playable: Playable | null;
  attempts: Attempt[];
  retimed: boolean;
  provider: string;
  model: string;
  latency_s: number;
  error?: string;
}

// control chars, zero-width and bidi-override characters (built from code points to keep the source ASCII)
const range = (a: number, b: number) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`;
const UNSAFE_CHARS = new RegExp(`[${range(0x00, 0x1f)}${range(0x7f, 0x9f)}${range(0x200b, 0x200f)}${range(0x2028, 0x202e)}${range(0x2066, 0x2069)}]`, "g");

/** Trim, collapse whitespace, drop control characters, cap length. */
export function cleanPrompt(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(UNSAFE_CHARS, " ").replace(/\s+/g, " ").trim();
}

const num = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : d);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Keep only the motion fields; everything else the model says is dropped. */
export function normalize(raw: unknown, request: string, model: string): Playable {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const kfs = Array.isArray(p.keyframes) ? p.keyframes : [];
  const keyframes: Keyframe[] = kfs.slice(0, 200).map((k) => {
    const kk = (k && typeof k === "object" ? k : {}) as Record<string, unknown>;
    const q = Array.isArray(kk.q) ? kk.q.map((v) => r4(num(v, NaN))) : [];
    const ease = typeof kk.ease === "string" && (EASES as readonly string[]).includes(kk.ease) ? kk.ease : kk.ease === undefined ? "cubic" : String(kk.ease).slice(0, 20);
    const out: Keyframe = { t: r4(num(kk.t, NaN)), q, ease };
    if (kk.grip !== undefined && kk.grip !== null) out.grip = r4(num(kk.grip, NaN));
    return out;
  });
  const name = typeof p.name === "string" ? slugify(p.name) : slugify(request);
  const notes = cleanPrompt(typeof p.notes === "string" ? p.notes : "").slice(0, 200);
  return {
    name,
    author: `llm:${model}`,
    created: new Date().toISOString(),
    prompt: request,
    notes,
    space: typeof p.space === "string" ? p.space : "joint",
    start: typeof p.start === "string" ? p.start : "ready",
    keyframes,
    loop: p.loop === undefined ? 1 : (p.loop as number),
    speed: p.speed === undefined ? 1 : (p.speed as number),
  };
}

function problems(c: CheckResult): string {
  const parts: string[] = [];
  if (c.validation.violations.length) parts.push(summarizeViolations(c.validation.violations));
  for (const g of c.geometry?.violations ?? []) parts.push(`${g.kind}: ${g.msg}`);
  if (!parts.length && !c.ok) parts.push("the playable could not be expanded (check the schema)");
  return parts.join("\n");
}

function keyframeTips(p: Playable): string {
  return p.keyframes
    .filter((k) => Array.isArray(k.q) && k.q.length === 6 && k.q.every(Number.isFinite))
    .map((k) => `  t=${k.t}: tip ${fmtXYZ(tipPosition(k.q) as Vec3)}`)
    .join("\n");
}

const MOTION_KEYS = ["name", "space", "start", "keyframes", "loop", "speed"] as const;

export async function authorPlayable(request: string, provider: LLMProvider, rounds = 3): Promise<AuthorResult> {
  const system = systemPrompt();
  const attempts: Attempt[] = [];
  let user = userPrompt(request);
  let playable: Playable | null = null;
  let check: CheckResult | null = null;
  let total = 0;
  let error: string | undefined;
  for (let i = 0; i <= rounds; i++) {
    const tag = i === 0 ? "initial" : `repair-${i}`;
    const t0 = Date.now();
    let raw: unknown;
    try {
      raw = await provider.complete(system, user);
    } catch (e) {
      error = e instanceof LLMError ? e.message : `LLM call failed: ${(e as Error).message}`;
      attempts.push({ round: tag, error, latency_s: (Date.now() - t0) / 1000 });
      break;
    }
    const dt = (Date.now() - t0) / 1000;
    total += dt;
    playable = normalize(raw, request, provider.model);
    check = checkPlayable(playable);
    const kinds = [...new Set([...check.validation.violations.map((v) => v.kind), ...(check.geometry?.violations ?? []).map((v) => v.kind)])].sort();
    attempts.push({ round: tag, ok: check.ok, n_violations: check.validation.violations.length + (check.geometry?.violations.length ?? 0), kinds, latency_s: Math.round(dt * 100) / 100 });
    if (check.ok || i === rounds) break;
    const prev = Object.fromEntries(MOTION_KEYS.map((k) => [k, playable![k]]));
    user = repairPrompt(request, prev, problems(check), keyframeTips(playable));
  }

  let retimed = false;
  if (playable && check && !check.ok) {
    const kinds = new Set(check.validation.violations.map((v) => v.kind));
    const onlySpeed = check.validation.violations.length > 0 && [...kinds].every((k) => SPEED_KINDS.has(k)) && (check.geometry?.ok ?? false);
    if (onlySpeed) {
      try {
        const fixed = retime(playable);
        const c2 = checkPlayable(fixed);
        if (c2.ok) {
          playable = fixed;
          check = c2;
          retimed = true;
          attempts.push({ round: "retime", ok: true, n_violations: 0, kinds: [] });
        }
      } catch (e) {
        attempts.push({ round: "retime", ok: false, error: (e as Error).message });
      }
    }
  }
  const empty: CheckResult = { ok: false, validation: { ok: false, violations: [], duration: null, max_vel: null, max_acc: null, transition: null, envelope: "" }, geometry: null };
  return {
    ...(check ?? empty),
    playable,
    attempts,
    retimed,
    provider: provider.id,
    model: provider.model,
    latency_s: Math.round(total * 100) / 100,
    ...(error && !playable ? { error } : {}),
  };
}
