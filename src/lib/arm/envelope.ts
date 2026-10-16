/**
 * The OpenYAM safety envelope, ported from the lab repo's armctl/envelope.py.
 * Soft box = URDF limits shrunk by 0.1 rad per side; caps 0.3 rad/s and 1.0 rad/s^2.
 * The lab station re-checks every playable with the Python original before anything moves.
 */
export const JOINTS = ["j1", "j2", "j3", "j4", "j5", "j6"] as const;
export type Vec6 = [number, number, number, number, number, number];

/** URDF joint limits (rad) as used by armctl.envelope (rounded to 3 decimals there). */
export const URDF_LIMITS: [number, number][] = [
  [-2.618, 3.142],
  [0.0, 3.665],
  [0.0, 3.142],
  [-1.693, 1.571],
  [-1.571, 1.571],
  [-2.094, 2.094],
];
export const MARGIN = 0.1;
export const SOFT_LIMITS: [number, number][] = URDF_LIMITS.map(([lo, hi]) => [lo + MARGIN, hi - MARGIN]);
export const VEL_CAP = 0.3; // rad/s per joint
export const ACC_CAP = 1.0; // rad/s^2 per joint
export const GRIP_VEL_CAP = 3.0; // fraction of full stroke per second (armctl/playable.py fallback)
export const EPS = 1e-9;

export const POSES: Record<string, Vec6> = {
  home: [0, 0, 0, 0, 0, 0],
  ready: [0, 0.5, 0.8, 0, 0, 0],
};

export const ENVELOPE = {
  source: "openyam-playground port of armctl.envelope (soft box URDF-0.1 rad, 0.3 rad/s, 1.0 rad/s^2)",
  soft: SOFT_LIMITS,
  velCap: [VEL_CAP, VEL_CAP, VEL_CAP, VEL_CAP, VEL_CAP, VEL_CAP],
  accCap: [ACC_CAP, ACC_CAP, ACC_CAP, ACC_CAP, ACC_CAP, ACC_CAP],
  gripVelCap: GRIP_VEL_CAP,
  poses: POSES,
};

export function describeEnvelope() {
  return {
    joints: [...JOINTS],
    soft_limits: SOFT_LIMITS.map(([a, b]) => [round(a, 4), round(b, 4)]),
    urdf_limits: URDF_LIMITS,
    vel_cap: VEL_CAP,
    acc_cap: ACC_CAP,
    grip_vel_cap: GRIP_VEL_CAP,
    poses: POSES,
  };
}

/** Round like Python's round(x, n) for display/fixture purposes (half away from zero; ties are vanishingly rare). */
export function round(x: number, n: number): number {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** n;
  const r = Math.round(Math.abs(x) * f) / f;
  return x < 0 ? -r : r;
}

/** Python's '{:g}' formatting (6 significant digits, trailing zeros stripped). */
export function fmtG(x: number): string {
  if (x === 0) return "0";
  const exp = Math.floor(Math.log10(Math.abs(x)));
  if (exp < -4 || exp >= 6) {
    const s = x.toExponential(5).replace(/\.?0+e/, "e");
    return s.replace(/e([+-])(\d)$/, "e$10$2");
  }
  const s = x.toFixed(Math.max(0, 5 - exp));
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}
