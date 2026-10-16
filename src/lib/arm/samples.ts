/**
 * Sample playables. `wave` and `nod` are the lab repo's hand-written examples (playables/*.json),
 * used as few-shot examples in the prompt, exactly as armctl/llm_author.py does. The rest power
 * MOCK_LLM=1 mode so the whole UI works without an API key.
 */
import type { Keyframe, Playable } from "./playable";

type Sample = { name: string; notes: string; keyframes: Keyframe[]; loop?: number; speed?: number; keywords: string[] };
const R = [0, 0.5, 0.8, 0, 0, 0];
const kf = (t: number, q: number[], grip = 0, ease: Keyframe["ease"] = "cubic"): Keyframe => ({ t, q, grip, ease });

export const WAVE: Sample = {
  name: "wave",
  notes: "Lift the forearm, then sway the base and roll the wrist side to side three times.",
  keywords: ["wave", "hello", "hi", "bye", "greet", "goodbye"],
  keyframes: [
    kf(0, R), kf(1.65, [0, 0.7, 1.1, -0.3, 0, 0]),
    kf(2.6, [0.08, 0.7, 1.1, -0.3, 0, 0.12]), kf(3.9, [-0.08, 0.7, 1.1, -0.3, 0, -0.12]),
    kf(5.2, [0.08, 0.7, 1.1, -0.3, 0, 0.12]), kf(6.5, [-0.08, 0.7, 1.1, -0.3, 0, -0.12]),
    kf(7.8, [0.08, 0.7, 1.1, -0.3, 0, 0.12]), kf(9.1, [-0.08, 0.7, 1.1, -0.3, 0, -0.12]),
    kf(10.05, [0, 0.7, 1.1, -0.3, 0, 0]), kf(11.7, R),
  ],
};

export const NOD: Sample = {
  name: "nod",
  notes: "Tilt the wrist (j4) down and up three times, like nodding yes.",
  keywords: ["nod", "yes", "agree", "ok"],
  keyframes: [
    kf(0, R), kf(0.85, [0, 0.55, 0.9, 0.05, 0, 0]),
    kf(2.2, [0, 0.55, 0.9, 0.3, 0, 0]), kf(3.55, [0, 0.55, 0.9, 0.05, 0, 0]),
    kf(4.9, [0, 0.55, 0.9, 0.3, 0, 0]), kf(6.25, [0, 0.55, 0.9, 0.05, 0, 0]),
    kf(7.6, [0, 0.55, 0.9, 0.3, 0, 0]), kf(8.95, [0, 0.55, 0.9, 0.05, 0, 0]), kf(9.8, R),
  ],
};

const UP = [0, 0.6, 1.3, -0.3, 0, 0];
export const VICTORY: Sample = {
  name: "victory-dance",
  notes: "Thrusts the hand up high, then sways and twists side to side while the gripper pumps open and shut.",
  keywords: ["victory", "dance", "celebrate", "party", "win", "yay", "hooray", "happy"],
  keyframes: [
    kf(0, R), kf(2.8, UP, 1),
    kf(4.0, [0.1, 0.6, 1.3, -0.3, 0, 0.15], 0), kf(5.8, [-0.1, 0.6, 1.3, -0.3, 0, -0.15], 1),
    kf(7.6, [0.1, 0.6, 1.3, -0.3, 0, 0.15], 0), kf(9.4, [-0.1, 0.6, 1.3, -0.3, 0, -0.15], 1),
    kf(10.6, UP, 1), kf(13.4, R, 0),
  ],
};

const BOW_UP = [0, 0.55, 0.85, -0.1, 0, 0];
const BOW_DOWN = [0, 1.2, 0.8, 0.4, 0, 0];
export const BOW: Sample = {
  name: "graceful-bow",
  notes: "Opens the hand with a small flourish, leans forward and down into a bow, holds, and rises back to ready.",
  keywords: ["bow", "thank", "thanks", "respect", "curtsy", "polite"],
  keyframes: [kf(0, R), kf(1.5, BOW_UP, 1), kf(5.5, BOW_DOWN, 1), kf(7.0, BOW_DOWN, 1, "hold"), kf(11.0, BOW_UP, 1), kf(12.5, R, 0)],
};

export const LOOK_AROUND: Sample = {
  name: "look-around",
  notes: "Turn the base left and right, tilting the wrist to peek, like scanning the room.",
  keywords: ["look", "scan", "search", "curious", "peek", "around", "explore"],
  keyframes: [
    kf(0, R), kf(1.2, [0, 0.6, 1.0, -0.15, 0, 0]), kf(3.9, [0.5, 0.6, 1.0, -0.1, 0.15, 0]),
    kf(4.5, [0.5, 0.6, 1.0, -0.1, 0.15, 0], 0, "hold"), kf(5.7, [0.5, 0.65, 1.05, -0.3, 0.15, 0]),
    kf(6.3, [0.5, 0.65, 1.05, -0.3, 0.15, 0], 0, "hold"), kf(11.7, [-0.5, 0.6, 1.0, -0.1, -0.15, 0]),
    kf(12.3, [-0.5, 0.6, 1.0, -0.1, -0.15, 0], 0, "hold"), kf(13.5, [-0.5, 0.65, 1.05, -0.3, -0.15, 0]),
    kf(14.1, [-0.5, 0.65, 1.05, -0.3, -0.15, 0], 0, "hold"), kf(16.8, [0, 0.6, 1.0, -0.15, 0, 0]),
    kf(17.4, [0, 0.6, 1.0, -0.15, 0, 0], 0, "hold"), kf(18.6, R),
  ],
};

export const EXAMPLES = [WAVE, NOD];
export const MOCK_SAMPLES = [VICTORY, WAVE, NOD, BOW, LOOK_AROUND];

export function toPlayable(s: Sample): Playable {
  return { name: s.name, notes: s.notes, space: "joint", start: "ready", keyframes: JSON.parse(JSON.stringify(s.keyframes)), loop: s.loop ?? 1, speed: s.speed ?? 1 };
}

/** Pick a sample for a request by keyword (deterministic fallback by hash). */
export function pickSample(request: string): Sample {
  const words: string[] = request.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const s of MOCK_SAMPLES) if (s.keywords.some((k) => words.includes(k) || words.some((w) => w.startsWith(k)))) return s;
  let h = 0;
  for (const c of request) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return MOCK_SAMPLES[h % MOCK_SAMPLES.length];
}
