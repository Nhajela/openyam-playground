/**
 * Forward kinematics of the YAM arm, from the joint origins and axes in
 * yam_description/i2rt/yam.urdf (i2rt-robotics/i2rt, as vendored by DimOS). Only the
 * kinematic numbers are used here (no meshes). Frame `gripper_tip` is DimOS's IK frame,
 * 10 cm beyond the gripper mount toward the fingertips. Units: metres, radians; base frame
 * is z-up with x pointing forward (the direction the arm reaches at j1 = 0).
 *
 * Verified against pinocchio on the same URDF (tests/fk.test.ts): home tip (0.211, 0, 0.174) m,
 * ready tip (0.205, 0, 0.432) m.
 */
export type Vec3 = [number, number, number];
export type Mat4 = number[]; // row-major 4x4

export interface UrdfJoint {
  name: string;
  child: string;
  xyz: Vec3;
  rpy: Vec3;
  axis: Vec3;
  type: "revolute" | "prismatic" | "fixed";
}

/** joint1..joint6 (revolute), then the fixed tip frame. Copied from yam.urdf. */
export const CHAIN: UrdfJoint[] = [
  { name: "joint1", child: "link1", xyz: [-2.49777947129965e-7, -9.17402363407408e-13, 0.0679999999995413], rpy: [0, 1.5708, 3.1415963267949], axis: [-1, 0, 0], type: "revolute" },
  { name: "joint2", child: "link2", xyz: [-0.0455, -0.0339, -0.02], rpy: [-1.7953e-16, 5.55112e-17, -3.14159], axis: [3.58252e-15, 1, -3.2007e-16], type: "revolute" },
  { name: "joint3", child: "link3", xyz: [4.08431e-7, -0.0688, 0.264], rpy: [-2.99502e-14, -1.6015e-14, -3.14159], axis: [4.54273e-15, 1, 1.04275e-14], type: "revolute" },
  { name: "joint4", child: "link4", xyz: [-0.0600003, -0.0688, -0.244999], rpy: [2.95536e-14, 8.52374e-14, -2.10585e-14], axis: [0, 1, 0], type: "revolute" },
  { name: "joint5", child: "link5", xyz: [-0.0405003, 0.0338995, -0.0739989], rpy: [2.73264e-14, -4.32956e-16, -8.32667e-17], axis: [1, 0, 0], type: "revolute" },
  { name: "joint6", child: "gripper", xyz: [0.0404996, 2.39858e-7, -0.0356], rpy: [8.83309e-16, -5.88588e-16, 7.69861e-14], axis: [1.46014e-15, 2.40808e-14, -1], type: "revolute" },
];
export const TIP_OFFSET: Vec3 = [0, 0, -0.1]; // gripper -> gripper_tip (fixed)
/** Finger prismatic joints in the gripper frame (joint7/joint8), stroke 0..0.04695 m. */
export const FINGERS = {
  left: { xyz: [-0.0239931, 0.0445119, -0.0566829] as Vec3, axis: [0, 1, 0] as Vec3 },
  right: { xyz: [0.0239931, -0.0445119, -0.0566829] as Vec3, axis: [0, -1, 0] as Vec3 },
  stroke: 0.04695,
};

export const TABLE_Z_MIN = 0.05; // m: the tip must stay above this plane
export const BEHIND_X_MIN = -0.1; // m: the tip must not go further behind the base than this

export function identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      o[r * 4 + c] = s;
    }
  return o;
}

/** URDF origin: translation then fixed-axis roll-pitch-yaw, R = Rz(y) Ry(p) Rx(r). */
export function originTransform(xyz: Vec3, rpy: Vec3): Mat4 {
  const [r, p, y] = rpy;
  const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), cy = Math.cos(y), sy = Math.sin(y);
  return [
    cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, xyz[0],
    sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, xyz[1],
    -sp, cp * sr, cp * cr, xyz[2],
    0, 0, 0, 1,
  ];
}

/** Rotation by angle about a (unit-normalised) axis (Rodrigues). */
export function axisAngle(axis: Vec3, angle: number): Mat4 {
  const n = Math.hypot(...axis);
  const [x, y, z] = [axis[0] / n, axis[1] / n, axis[2] / n];
  const c = Math.cos(angle), s = Math.sin(angle), C = 1 - c;
  return [
    c + x * x * C, x * y * C - z * s, x * z * C + y * s, 0,
    y * x * C + z * s, c + y * y * C, y * z * C - x * s, 0,
    z * x * C - y * s, z * y * C + x * s, c + z * z * C, 0,
    0, 0, 0, 1,
  ];
}

export function translation(v: Vec3): Mat4 {
  return [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2], 0, 0, 0, 1];
}

export function position(m: Mat4): Vec3 {
  return [m[3], m[7], m[11]];
}

export interface FkFrames {
  /** world transform of each joint frame after applying q: link1..link5, gripper */
  links: Mat4[];
  /** world position of each joint origin (before its rotation, same point) */
  jointOrigins: Vec3[];
  gripper: Mat4;
  tip: Vec3;
}

export function forwardKinematics(q: number[]): FkFrames {
  let T = identity();
  const links: Mat4[] = [];
  const jointOrigins: Vec3[] = [];
  CHAIN.forEach((j, i) => {
    T = mul(T, originTransform(j.xyz, j.rpy));
    jointOrigins.push(position(T));
    T = mul(T, axisAngle(j.axis, q[i] ?? 0));
    links.push(T);
  });
  const gripper = T;
  const tip = position(mul(gripper, translation(TIP_OFFSET)));
  return { links, jointOrigins, gripper, tip };
}

export function tipPosition(q: number[]): Vec3 {
  return forwardKinematics(q).tip;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;
export const fmtXYZ = (p: Vec3) => `(${r3(p[0]).toFixed(3)}, ${r3(p[1]).toFixed(3)}, ${r3(p[2]).toFixed(3)})`;

/**
 * How a +delta on each joint moves the tip, from a reference pose (finite differences).
 * Used in the LLM prompt so the model has geometry, not just joint names.
 */
export function jointEffects(ref: number[], delta = 0.3) {
  const base = tipPosition(ref);
  return ref.map((_, j) => {
    const q = [...ref];
    q[j] += delta;
    const p = tipPosition(q);
    return { joint: `j${j + 1}`, delta, dx: p[0] - base[0], dy: p[1] - base[1], dz: p[2] - base[2] };
  });
}

export function describeMotion(d: { dx: number; dy: number; dz: number }): string {
  const parts: string[] = [];
  const mm = (v: number) => `${Math.round(Math.abs(v) * 1000)} mm`;
  if (Math.abs(d.dz) >= 0.005) parts.push(`${d.dz > 0 ? "up" : "down"} ${mm(d.dz)}`);
  if (Math.abs(d.dx) >= 0.005) parts.push(`${d.dx > 0 ? "forward" : "back"} ${mm(d.dx)}`);
  if (Math.abs(d.dy) >= 0.005) parts.push(`${d.dy > 0 ? "left" : "right"} ${mm(d.dy)}`);
  return parts.length ? parts.join(", ") : "tip barely moves (it rotates the hand in place)";
}

export interface GeometryViolation {
  kind: "tip_below_table" | "tip_behind_base";
  t_play: number;
  t_play_span: [number, number];
  value: number;
  limit: number;
  msg: string;
}

export interface GeometryReport {
  ok: boolean;
  violations: GeometryViolation[];
  keyframe_tips: { t: number; tip: Vec3 }[];
  min_z: number;
  min_x: number;
  max_reach: number;
  table_z_min: number;
  behind_x_min: number;
}

/**
 * Geometry check on the sampled path: the tip must stay above the table plane
 * (z >= 0.05 m) and not swing more than 0.10 m behind the base (x >= -0.10 m).
 */
export function checkGeometry(
  samples: { t: number[]; q: number[][] },
  keyframes: { t: number; q: number[] }[],
  stride = 2,
): GeometryReport {
  const violations: GeometryViolation[] = [];
  let minZ = Infinity, minX = Infinity, maxReach = 0;
  type Run = { a: number; b: number; worst: number; worstT: number } | null;
  let below: Run = null, behind: Run = null;
  const flush = (run: Run, kind: GeometryViolation["kind"]) => {
    if (!run) return;
    const limit = kind === "tip_below_table" ? TABLE_Z_MIN : BEHIND_X_MIN;
    violations.push({
      kind, t_play: Math.round(run.worstT * 100) / 100, t_play_span: [Math.round(run.a * 100) / 100, Math.round(run.b * 100) / 100],
      value: Math.round(run.worst * 1000) / 1000, limit,
      msg: kind === "tip_below_table"
        ? `gripper tip dips to z=${run.worst.toFixed(3)} m, below the table safety plane z=${TABLE_Z_MIN} m, at playback ${run.worstT.toFixed(2)} s (raise j2/j3 less or keep j4 nearer 0 there)`
        : `gripper tip swings to x=${run.worst.toFixed(3)} m, more than ${-BEHIND_X_MIN} m behind the base, at playback ${run.worstT.toFixed(2)} s (j3 too large or j1 turned too far)`,
    });
  };
  const n = samples.t.length;
  const indices: number[] = [];
  for (let i = 0; i < n; i += stride) indices.push(i);
  if (n && indices[indices.length - 1] !== n - 1) indices.push(n - 1);
  for (const i of indices) {
    const t = samples.t[i];
    const p = tipPosition(samples.q[i]);
    minZ = Math.min(minZ, p[2]);
    minX = Math.min(minX, p[0]);
    maxReach = Math.max(maxReach, Math.hypot(p[0], p[1]));
    if (p[2] < TABLE_Z_MIN) {
      if (!below) below = { a: t, b: t, worst: p[2], worstT: t };
      below.b = t;
      if (p[2] < below.worst) { below.worst = p[2]; below.worstT = t; }
    } else if (below) { flush(below, "tip_below_table"); below = null; }
    if (p[0] < BEHIND_X_MIN) {
      if (!behind) behind = { a: t, b: t, worst: p[0], worstT: t };
      behind.b = t;
      if (p[0] < behind.worst) { behind.worst = p[0]; behind.worstT = t; }
    } else if (behind) { flush(behind, "tip_behind_base"); behind = null; }
  }
  flush(below, "tip_below_table");
  flush(behind, "tip_behind_base");
  return {
    ok: violations.length === 0,
    violations,
    keyframe_tips: keyframes.map((k) => ({ t: k.t, tip: tipPosition(k.q).map((v) => Math.round(v * 1000) / 1000) as Vec3 })),
    min_z: Math.round(minZ * 1000) / 1000,
    min_x: Math.round(minX * 1000) / 1000,
    max_reach: Math.round(maxReach * 1000) / 1000,
    table_z_min: TABLE_Z_MIN,
    behind_x_min: BEHIND_X_MIN,
  };
}
