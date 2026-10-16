#!/usr/bin/env python3
"""OpenYAM playables v1: reference validator, forward kinematics and offline-link codec.

Standard library only (Python 3.8+). This is the listing from the public spec
(https://nhajela.github.io/openyam-playground/spec/v1.md, section "Reference validator
in Python"). It reproduces the lab's validator (armctl/playable.py + armctl/envelope.py)
step by step, so a playable that passes here passes at the lab, with the same violation
kinds. The geometry check (tip height, links above the table, tip not behind the base)
is a separate, additional check.

    python3 reference-validator.py my-dance.json            # validate + geometry
    python3 reference-validator.py my-dance.json --link     # also print the offline QR link
    python3 reference-validator.py --decode '<link or fragment>'
"""
import base64
import bisect
import json
import math
import re
import sys
import zlib

# ---------------------------------------------------------------- constants (spec section 5-6)
FORMAT = "openyam-playable"
SUPPORTED_MAJOR = 1
JOINTS = ["j1", "j2", "j3", "j4", "j5", "j6"]
URDF_LIMITS = [(-2.618, 3.142), (0.0, 3.665), (0.0, 3.142),
               (-1.693, 1.571), (-1.571, 1.571), (-2.094, 2.094)]
MARGIN = 0.1
SOFT = [(lo + MARGIN, hi - MARGIN) for lo, hi in URDF_LIMITS]
CAP_PRESETS = {"default": (0.3, 1.0), "dance": (0.6, 2.0)}  # (vel rad/s, acc rad/s^2)
GRIP_VEL_CAP = 3.0       # full strokes per second
POSES = {"home": [0.0] * 6, "ready": [0.0, 0.5, 0.8, 0.0, 0.0, 0.0]}
RATE_HZ = 100.0
DT = 1.0 / RATE_HZ
MAX_DURATION_S = 60.0
START_TOL = 0.05
LOOP_TOL = 0.01
EASES = ("linear", "cubic", "hold")
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
VIEWER = "https://nhajela.github.io/openyam-playground/viewer.html"


def _num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _viol(kind, msg, t=None, joint=None, value=None, limit=None, t_play=None):
    return {"kind": kind, "joint": joint, "t": t, "t_play": t_play,
            "value": value, "limit": limit, "msg": msg}


# ---------------------------------------------------------------- parsing (spec 7.1-7.3)
def compat(p):
    fmt, ver = p.get("format"), p.get("version")
    if fmt is None and ver is None:
        return True, "legacy (no format/version), treated as 1.0"
    if fmt != FORMAT:
        return False, "format %r is not %r" % (fmt, FORMAT)
    if not isinstance(ver, str) or not re.fullmatch(r"\d+\.\d+", ver):
        return False, "version %r must be a 'MAJOR.MINOR' string, e.g. '1.0'" % (ver,)
    if int(ver.split(".")[0]) != SUPPORTED_MAJOR:
        return False, "version %s not supported: this lab reads %d.x" % (ver, SUPPORTED_MAJOR)
    return True, "%s %s" % (FORMAT, ver)


def parse(p):
    """-> (keys [(t, q[6], grip, ease)], violations)."""
    v = []

    def bad(msg, t=None, kind="schema"):
        v.append(_viol(kind, msg, t=t))

    if not isinstance(p.get("name"), str) or not NAME_RE.match(p["name"]):
        bad("name %r must match %s" % (p.get("name"), NAME_RE.pattern))
    space = p.get("space", "joint")
    if space == "cartesian":
        bad("space 'cartesian' is parsed but not supported yet; use 'joint'", kind="unsupported")
    elif space != "joint":
        bad("space must be 'joint' or 'cartesian', got %r" % (space,))
    if p.get("start", "ready") not in POSES:
        bad("start %r is not a named pose (home, ready)" % (p.get("start"),))
    loop = p.get("loop", 1)
    if not isinstance(loop, int) or isinstance(loop, bool) or not 1 <= loop <= 10:
        bad("loop must be an integer 1..10, got %r" % (loop,))
    speed = p.get("speed", 1.0)
    if not _num(speed) or not 0 < speed <= 2:
        bad("speed must be a number in (0, 2], got %r" % (speed,))
    kfs = p.get("keyframes")
    keys = []
    if not isinstance(kfs, list) or not kfs:
        bad("keyframes must be a non-empty list")
        return keys, v
    if len(kfs) < 2:
        bad("keyframes needs at least 2 entries (the lab cannot play a single keyframe)")
    grip = 0.0
    for i, k in enumerate(kfs):
        if not isinstance(k, dict):
            bad("keyframe %d is not an object" % i)
            continue
        t, q = k.get("t"), k.get("q")
        if not _num(t):
            bad("keyframe %d: t must be a number" % i)
            continue
        if not isinstance(q, list) or len(q) != 6 or not all(_num(x) for x in q):
            bad("keyframe %d (t=%s): q must be a list of 6 numbers (rad)" % (i, t), t)
            continue
        if k.get("grip") is not None:
            g = k["grip"]
            if not _num(g) or not 0.0 <= g <= 1.0:
                bad("keyframe %d (t=%s): grip must be 0..1, got %r" % (i, t, g), t)
                continue
            grip = float(g)
        ease = k.get("ease", "cubic") or "cubic"
        if not isinstance(ease, str) or ease not in EASES:
            bad("keyframe %d (t=%s): ease must be one of %s, got %r" % (i, t, EASES, ease), t)
            ease = "cubic"
        keys.append((float(t), [float(x) for x in q], grip, ease))
    if keys and abs(keys[0][0]) > 1e-9:
        bad("first keyframe must be at t=0, got t=%s" % keys[0][0], keys[0][0])
    for a, b in zip(keys, keys[1:]):
        if b[0] <= a[0]:
            v.append(_viol("non_monotonic_t", "keyframe t=%s is not after previous t=%s" % (b[0], a[0]),
                           t=b[0], value=b[0], limit=a[0]))
    return keys, v


# ---------------------------------------------------------------- timeline (spec 6)
def transition_duration(q0, q1, vel_cap, acc_cap):
    d = [abs(b - a) for a, b in zip(q0, q1)]
    vel, acc = vel_cap * 0.5, acc_cap * 0.5
    T = max(max(1.5 * x / vel for x in d), max(math.sqrt(6 * x / acc) for x in d), 0.5)
    return round(T + 0.05, 2)


def timeline(p, caps):
    """-> (segments, transition, violations). segment = dict(t0, t1, q0, q1, g0, g1, ease, authored_t0, speed, label)."""
    keys, viol = parse(p)
    if not keys or any(x["kind"] in ("schema", "non_monotonic_t", "unsupported") for x in viol):
        return [], None, viol
    speed = float(p.get("speed", 1.0))
    loops = int(p.get("loop", 1))
    start_name = p.get("start", "ready")
    start_q = POSES[start_name]
    segs, t, transition = [], 0.0, None
    gap0 = max(abs(a - b) for a, b in zip(keys[0][1], start_q))
    if gap0 > START_TOL:
        T = transition_duration(start_q, keys[0][1], *caps)
        segs.append(dict(t0=0.0, t1=T, q0=start_q, q1=keys[0][1], g0=keys[0][2], g1=keys[0][2],
                         ease="cubic", authored_t0=None, speed=1.0, label="transition from start pose"))
        transition = {"from": start_name, "duration": T, "max_delta": gap0}
        t = T
    for L in range(loops):
        if L > 0:
            gap = max(abs(a - b) for a, b in zip(keys[-1][1], keys[0][1]))
            if gap > LOOP_TOL:
                viol.append(_viol("loop_discontinuity",
                                  "loop=%d but the last keyframe differs from the first by %.3f rad; make them equal"
                                  % (loops, gap), t=keys[-1][0], value=gap, limit=LOOP_TOL))
                return segs, transition, viol
        for i in range(1, len(keys)):
            a, b = keys[i - 1], keys[i]
            dt = (b[0] - a[0]) / speed
            segs.append(dict(t0=t, t1=t + dt, q0=a[1], q1=b[1], g0=a[2], g1=b[2], ease=b[3],
                             authored_t0=a[0], speed=speed,
                             label="loop %d: keyframe %d->%d (t %g->%g)" % (L + 1, i - 1, i, a[0], b[0])))
            t += dt
    return segs, transition, viol


def shape(ease, s):
    if ease == "linear":
        return s
    if ease == "hold":
        return 1.0 if s >= 1.0 else 0.0
    return s * s * (3 - 2 * s)  # cubic = smoothstep


def sample(segs):
    """-> (ts, Q, G, seg_index) on the 100 Hz grid plus the exact end time."""
    D = segs[-1]["t1"]
    n = int(math.floor(D * RATE_HZ + 1e-9))
    ts = [k / RATE_HZ for k in range(n + 1)]
    if ts[-1] < D - 1e-9:
        ts.append(D)
    starts = [s["t0"] for s in segs]
    Q, G, idx = [], [], []
    for t in ts:
        i = min(max(bisect.bisect_right(starts, t) - 1, 0), len(segs) - 1)
        sg = segs[i]
        span = sg["t1"] - sg["t0"]
        s = 1.0 if span <= 0 else min(max((t - sg["t0"]) / span, 0.0), 1.0)
        w = shape(sg["ease"], s)
        Q.append([a + w * (b - a) for a, b in zip(sg["q0"], sg["q1"])])
        G.append(sg["g0"] + w * (sg["g1"] - sg["g0"]))
        idx.append(i)
    return ts, Q, G, idx


def gradient(f, x):
    """numpy.gradient(f, x) for 1-D lists: 2nd-order non-uniform interior, 1st-order edges."""
    n = len(f)
    out = [0.0] * n
    out[0] = (f[1] - f[0]) / (x[1] - x[0])
    out[-1] = (f[-1] - f[-2]) / (x[-1] - x[-2])
    for i in range(1, n - 1):
        h1, h2 = x[i] - x[i - 1], x[i + 1] - x[i]
        a = -h2 / (h1 * (h1 + h2))
        b = (h2 - h1) / (h1 * h2)
        c = h1 / (h2 * (h1 + h2))
        out[i] = a * f[i - 1] + b * f[i] + c * f[i + 1]
    return out


def _runs(mask):
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j + 1 < n and mask[j + 1]:
                j += 1
            out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


# ---------------------------------------------------------------- validation (spec 7)
def validate(p):
    if not isinstance(p, dict):
        return {"ok": False, "violations": [_viol("schema", "playable must be a JSON object")], "duration": None}
    ok, note = compat(p)
    if not ok:
        return {"ok": False, "duration": None, "transition": None,
                "violations": [_viol("version", note, value=p.get("version"))]}
    preset = p.get("caps", "default")
    if not isinstance(preset, str) or preset not in CAP_PRESETS:
        return {"ok": False, "duration": None, "transition": None,
                "violations": [_viol("schema", "unknown caps preset %r" % (preset,), value=preset)]}
    vcap, acap = CAP_PRESETS[preset]
    segs, transition, viol = timeline(p, (vcap, acap))
    res = {"ok": False, "violations": viol, "duration": None, "transition": transition, "caps": preset}
    if not segs:
        return res
    keys, _ = parse(p)
    lo = [a for a, _ in SOFT]
    hi = [b for _, b in SOFT]
    start_q = POSES[p.get("start", "ready")]

    for i, (t, q, _, _) in enumerate(keys):
        for j in range(6):
            if q[j] < lo[j] or q[j] > hi[j]:
                lim = lo[j] if q[j] < lo[j] else hi[j]
                viol.append(_viol("keyframe_out_of_range", "keyframe %d (t=%g): %s %.3f %s soft limit %.3f"
                                  % (i, t, JOINTS[j], q[j], "<" if q[j] < lo[j] else ">", lim),
                                  t=t, joint=JOINTS[j], value=round(q[j], 4), limit=round(lim, 4)))
    for i in range(1, len(keys)):
        if keys[i][3] == "hold":
            d = max(abs(a - b) for a, b in zip(keys[i][1], keys[i - 1][1]))
            if d > 1e-6:
                viol.append(_viol("hold_jump", "keyframe %d (t=%g) has ease 'hold' but q differs from keyframe %d "
                                  "by %.3f rad; repeat the previous q or use 'cubic'" % (i, keys[i][0], i - 1, d),
                                  t=keys[i][0], value=round(d, 4), limit=0.0))

    ts, Q, G, idx = sample(segs)
    N = len(ts)
    D = ts[-1]
    res["duration"] = round(D, 3)
    if D > MAX_DURATION_S:
        viol.append(_viol("too_long", "playback lasts %.1f s (incl. transition, loops, speed) > %.0f s"
                          % (D, MAX_DURATION_S), value=round(D, 2), limit=MAX_DURATION_S, t_play=round(D, 2)))

    in_trans = [segs[i]["authored_t0"] is None for i in idx]
    LO = [[min(lo[j], start_q[j]) if tr else lo[j] for j in range(6)] for tr in in_trans]
    HI = [[max(hi[j], start_q[j]) if tr else hi[j] for j in range(6)] for tr in in_trans]
    cols = [[Q[k][j] for k in range(N)] for j in range(6)]
    if N > 1:
        Vc = [gradient(c, ts) for c in cols]
        Gv = gradient(G, ts)
    else:
        Vc, Gv = [[0.0] * N for _ in range(6)], [0.0] * N
    Ac = [[0.0] * N for _ in range(6)]
    if N > 2:
        for j in range(6):
            c = cols[j]
            for k in range(1, N - 1):
                Ac[j][k] = (c[k + 1] - 2 * c[k] + c[k - 1]) / DT ** 2
            Ac[j][0] = (c[1] - c[0]) / DT ** 2
            Ac[j][-1] = (c[-2] - c[-1]) / DT ** 2
    res["max_vel"] = [round(max(abs(x) for x in Vc[j]), 3) for j in range(6)]
    res["max_acc"] = [round(max(abs(x) for x in Ac[j]), 3) for j in range(6)]
    res["max_grip_vel"] = round(max(abs(x) for x in Gv), 3)

    def authored(sg, tp):
        return None if sg["authored_t0"] is None else round(sg["authored_t0"] + (tp - sg["t0"]) * sg["speed"], 3)

    def add_runs(mask, vals, jn, kind, limit, what):
        for a, b in _runs(mask):
            w = max(range(a, b + 1), key=lambda k: (abs(vals[k]), -k))
            sg = segs[idx[w]]
            lim = limit[w] if isinstance(limit, list) else limit
            at = authored(sg, ts[w])
            when = ("t=%g" % at) if at is not None else ("playback %.2fs" % ts[w])
            viol.append(_viol(kind, "%s %s %.3f (limit %.3f) at %s (%s, for %.2fs)"
                              % (jn, what, vals[w], lim, when, sg["label"], ts[b] - ts[a]),
                              t=at, joint=jn, value=round(vals[w], 4), limit=round(lim, 4),
                              t_play=round(ts[w], 2)))

    for j in range(6):
        c, jn = cols[j], JOINTS[j]
        add_runs([c[k] < LO[k][j] - 1e-9 for k in range(N)], c, jn, "path_out_of_range",
                 [LO[k][j] for k in range(N)], "path below soft limit:")
        add_runs([c[k] > HI[k][j] + 1e-9 for k in range(N)], c, jn, "path_out_of_range",
                 [HI[k][j] for k in range(N)], "path above soft limit:")
        add_runs([abs(x) > vcap + 1e-9 for x in Vc[j]], Vc[j], jn, "velocity", vcap, "velocity rad/s")
        add_runs([abs(x) > acap + 1e-9 for x in Ac[j]], Ac[j], jn, "acceleration", acap, "acceleration rad/s^2")
    add_runs([abs(x) > GRIP_VEL_CAP + 1e-9 for x in Gv], Gv, "grip", "grip_velocity", GRIP_VEL_CAP,
             "gripper speed strokes/s")

    # cross-check: the lab's armctl.envelope.check_path on the 100 Hz grid (spec 7.9)
    n_grid = int(math.floor(D * RATE_HZ + 1e-9)) + 1
    start_outside = any(start_q[j] < lo[j] - 1e-9 or start_q[j] > hi[j] + 1e-9 for j in range(6))
    mine = {(x["joint"], "range" if x["kind"] in ("path_out_of_range", "keyframe_out_of_range") else x["kind"])
            for x in viol}
    for jn, kind, value, msg in check_path(Q[:n_grid], vcap, acap, start_outside):
        k = "range" if kind in ("soft_lower", "soft_upper") else kind
        if (jn, k) in mine:
            continue
        viol.append(_viol("envelope_" + kind, "envelope cross-check: " + msg, joint=jn, value=value))
    res["ok"] = not viol
    return res


def check_path(Q, vcap, acap, from_outside):
    """The lab envelope's independent path check: soft box (monotone recovery allowed when the
    path starts outside), forward-difference velocity and second-difference acceleration."""
    lo = [a for a, _ in SOFT]
    hi = [b for _, b in SOFT]
    out_of = lambda q: [max(lo[i] - q[i], 0.0) + max(q[i] - hi[i], 0.0) for i in range(6)]
    found, prev = {}, out_of(Q[0])
    for k, q in enumerate(Q):
        o = out_of(q)
        for i in range(6):
            if o[i] <= 1e-9:
                continue
            if from_outside and (k == 0 or o[i] <= prev[i] + 1e-9):
                continue
            kind = "soft_upper" if q[i] > hi[i] else "soft_lower"
            found.setdefault((i, kind), q[i])
        prev = o
    res = [(JOINTS[i], kind, v, "%s %s %.3f" % (JOINTS[i], kind, v)) for (i, kind), v in sorted(found.items())]
    if len(Q) >= 2:
        vel = [[(Q[k + 1][i] - Q[k][i]) / DT for i in range(6)] for k in range(len(Q) - 1)]
        for i in range(6):
            m = max(abs(r[i]) for r in vel)
            if m > vcap * (1 + 1e-3) + 1e-9:
                res.append((JOINTS[i], "velocity", m, "%s velocity %.3f rad/s > cap %.3f" % (JOINTS[i], m, vcap)))
        if len(Q) >= 3:
            for i in range(6):
                m = max(abs(vel[k + 1][i] - vel[k][i]) / DT for k in range(len(vel) - 1))
                if m > acap * (1 + 1e-2) + 1e-9:
                    res.append((JOINTS[i], "acceleration", m,
                                "%s acceleration %.3f rad/s^2 > cap %.3f" % (JOINTS[i], m, acap)))
    return res


# ---------------------------------------------------------------- forward kinematics (spec 9)
# (xyz, rpy, axis) of joint1..joint6 from the i2rt YAM URDF; gripper_tip = gripper + (0, 0, -0.1).
CHAIN = [
    ((-2.49777947129965e-07, -9.17402363407408e-13, 0.0679999999995413), (0, 1.5708, 3.1415963267949), (-1, 0, 0)),
    ((-0.0455, -0.0339, -0.02), (-1.7953e-16, 5.55112e-17, -3.14159), (3.58252e-15, 1, -3.2007e-16)),
    ((4.08431e-07, -0.0688, 0.264), (-2.99502e-14, -1.6015e-14, -3.14159), (4.54273e-15, 1, 1.04275e-14)),
    ((-0.0600003, -0.0688, -0.244999), (2.95536e-14, 8.52374e-14, -2.10585e-14), (0, 1, 0)),
    ((-0.0405003, 0.0338995, -0.0739989), (2.73264e-14, -4.32956e-16, -8.32667e-17), (1, 0, 0)),
    ((0.0404996, 2.39858e-07, -0.0356), (8.83309e-16, -5.88588e-16, 7.69861e-14), (1.46014e-15, 2.40808e-14, -1)),
]
TIP_OFFSET = (0.0, 0.0, -0.1)
FINGERS = [(-0.0239931, 0.0445119, -0.0566829), (0.0239931, -0.0445119, -0.0566829)]  # at grip q7=q8=0


def _mul(A, B):
    return [[sum(A[r][k] * B[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def _origin(xyz, rpy):
    r, p, y = rpy
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    return [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, xyz[0]],
            [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, xyz[1]],
            [-sp, cp * sr, cp * cr, xyz[2]],
            [0, 0, 0, 1]]


def _rot(axis, a):
    n = math.sqrt(sum(x * x for x in axis))
    x, y, z = (v / n for v in axis)
    c, s = math.cos(a), math.sin(a)
    C = 1 - c
    return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s, 0],
            [y * x * C + z * s, c + y * y * C, y * z * C - x * s, 0],
            [z * x * C - y * s, z * y * C + x * s, c + z * z * C, 0],
            [0, 0, 0, 1]]


def _apply(T, v):
    return [T[r][0] * v[0] + T[r][1] * v[1] + T[r][2] * v[2] + T[r][3] for r in range(3)]


def fk(q):
    """-> {"link1".."link5", "gripper", "gripper_tip", "tip_left", "tip_right": [x, y, z]} in metres."""
    T = [[1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]
    out = {}
    names = ["link1", "link2", "link3", "link4", "link5", "gripper"]
    for (xyz, rpy, axis), a, name in zip(CHAIN, q, names):
        T = _mul(_mul(T, _origin(xyz, rpy)), _rot(axis, a))
        out[name] = [T[0][3], T[1][3], T[2][3]]
    out["gripper_tip"] = _apply(T, TIP_OFFSET)
    out["tip_left"], out["tip_right"] = _apply(T, FINGERS[0]), _apply(T, FINGERS[1])
    return out


MIN_TIP_Z, MIN_LINK_Z, MIN_TIP_X = 0.08, 0.03, -0.10


def geometry(p, stride=1):
    """Workspace check on the sampled path (spec 10): tip z >= 0.08 m, every link frame except
    base/link1 z >= 0.03 m, tip x >= -0.10 m. Returns {ok, min_tip_z, min_link_z, min_tip_x, failures}."""
    vcap, acap = CAP_PRESETS.get(p.get("caps", "default"), CAP_PRESETS["default"])
    segs, _, _ = timeline(p, (vcap, acap))
    if not segs:
        return {"ok": None, "failures": ["cannot sample (fix the validation errors first)"]}
    ts, Q, _, _ = sample(segs)
    mz, ml, mx, fails = 9.0, 9.0, 9.0, []
    for k in list(range(0, len(ts), stride)) + [len(ts) - 1]:
        f = fk(Q[k])
        tip = f["gripper_tip"]
        low = min(v[2] for n, v in f.items() if n != "link1")
        mz, ml, mx = min(mz, tip[2]), min(ml, low), min(mx, tip[0])
        if tip[2] < MIN_TIP_Z or low < MIN_LINK_Z or tip[0] < MIN_TIP_X:
            fails.append("playback %.2fs: tip (%.3f, %.3f, %.3f) m, lowest link z %.3f m" % (ts[k], *tip, low))
    return {"ok": not fails, "min_tip_z": round(mz, 4), "min_link_z": round(ml, 4),
            "min_tip_x": round(mx, 4), "failures": fails[:10], "n_failures": len(fails)}


# ---------------------------------------------------------------- offline link (spec 13)
def encode_link(playable, prompt=None, base=VIEWER):
    env = {"v": 1, **({"prompt": prompt} if prompt else {}), "playable": playable}
    raw = json.dumps(env, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    data = base64.urlsafe_b64encode(zlib.compress(raw, 9)).decode("ascii").rstrip("=")
    return "%s#p=%s" % (base, data)


def decode_link(link):
    frag = link.split("#", 1)[1] if "#" in link else link
    if frag.startswith("p="):
        frag = frag[2:]
    env = json.loads(zlib.decompress(base64.urlsafe_b64decode(frag + "=" * (-len(frag) % 4))).decode("utf-8"))
    if not isinstance(env, dict) or env.get("v") != 1 or not isinstance(env.get("playable"), dict):
        raise ValueError("unknown playable link format")
    return env


def main(argv):
    if len(argv) >= 2 and argv[0] == "--decode":
        print(json.dumps(decode_link(argv[1]), indent=2))
        return 0
    if not argv:
        print(__doc__)
        return 2
    p = json.load(open(argv[0], encoding="utf-8"))
    r = validate(p)
    print(("OK" if r["ok"] else "REJECTED") + "  duration %s s  caps %s" % (r["duration"], r.get("caps")))
    if r.get("transition"):
        print("  transition from %(from)s prepended: %(duration)s s" % r["transition"])
    if r.get("max_vel"):
        print("  max |vel| rad/s  " + " ".join("%s=%.2f" % x for x in zip(JOINTS, r["max_vel"])))
        print("  max |acc| rad/s2 " + " ".join("%s=%.2f" % x for x in zip(JOINTS, r["max_acc"])))
    for v in r["violations"]:
        print("  - [%s] %s" % (v["kind"], v["msg"]))
    g = geometry(p) if r["duration"] is not None else None
    if g and g["ok"] is not None:
        print("GEOMETRY " + ("OK" if g["ok"] else "FAILED") + "  min tip z %.3f m, min link z %.3f m, min tip x %.3f m"
              % (g["min_tip_z"], g["min_link_z"], g["min_tip_x"]))
        for f in g["failures"]:
            print("  - " + f)
    if "--link" in argv:
        link = encode_link(p)
        print("\n%s\n(%d characters)" % (link, len(link)))
    return 0 if r["ok"] and (g or {}).get("ok") else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
