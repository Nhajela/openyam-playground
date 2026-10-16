"""Produce reference validator / retime / FK results from the lab's Python code.

Run with the lab venv (needs numpy + pinocchio + the lab repo):
  /home/naman/openyam-robot-arm/.venv/bin/python scripts/make_reference.py
Writes tests/fixtures/python-reference.json, which the TypeScript tests compare against.
"""
import copy, json, sys
from pathlib import Path

LAB = Path("/home/naman/openyam-robot-arm")
URDF = "/home/naman/.local/share/dimos/repo/data/yam_description/i2rt/yam.urdf"
sys.path.insert(0, str(LAB))
from armctl import playable as P  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "tests/fixtures/python-reference.json"


def load(n):
    return json.loads((LAB / "playables" / f"{n}.json").read_text())


def mut(name, fn, base):
    p = copy.deepcopy(load(base))
    fn(p)
    return name, p


def scale_t(f):
    def g(p):
        for k in p["keyframes"]:
            k["t"] = round(k["t"] * f, 3)
    return g


def set_kf(i, **kw):
    def g(p):
        p["keyframes"][i].update(kw)
    return g


def set_q(i, j, v):
    def g(p):
        p["keyframes"][i]["q"][j] = v
    return g


def all_ease(e):
    def g(p):
        for k in p["keyframes"][1:]:
            k["ease"] = e
    return g


def chain(*fs):
    def g(p):
        for f in fs:
            f(p)
    return g


names = sorted(x.stem for x in (LAB / "playables").glob("*.json"))
cases = [(n, load(n)) for n in names]
cases += [
    mut("oob-j4", set_q(2, 3, -1.7), "wave"),
    mut("oob-j2-high", set_q(3, 1, 3.7), "nod"),
    mut("fast-nod", scale_t(0.4), "nod"),
    mut("fast-dance", scale_t(0.5), "happy-dance"),
    mut("linear-dance", all_ease("linear"), "happy-dance"),
    mut("hold-jump", set_kf(3, ease="hold"), "nod"),
    mut("non-monotonic", set_kf(3, t=1.0), "nod"),
    mut("loop-ok", lambda p: p.update(loop=2), "wave"),
    mut("loop-bad", chain(lambda p: p.update(loop=2), set_q(-1, 0, 0.2)), "wave"),
    mut("too-long", lambda p: p.update(speed=0.15), "look-around"),
    mut("speed-2", lambda p: p.update(speed=2.0), "wave"),
    mut("offset-start", lambda p: p["keyframes"][0].update(q=[0.3, 0.7, 1.0, 0.2, 0, 0]), "nod"),
    mut("start-home", lambda p: p.update(start="home"), "nod"),
    mut("grip-fast", chain(set_kf(1, t=0.2, grip=1.0, q=[0.0, 0.5, 0.8, 0.0, 0.0, 0.0])), "nod"),
    mut("bad-q-len", set_kf(2, q=[0, 0.5, 0.8, 0, 0]), "nod"),
    mut("bad-ease", set_kf(2, ease="bouncy"), "nod"),
    mut("bad-first-t", set_kf(0, t=0.5), "nod"),
    mut("bad-start", lambda p: p.update(start="sideways"), "nod"),
    mut("bad-grip", set_kf(2, grip=1.5), "nod"),
    mut("j1-sweep-fast", chain(set_q(2, 0, 2.9), set_q(4, 0, -2.4)), "look-around"),
]

valid = []
for name, p in cases:
    r = P.validate(p)
    vs = [{k: v.get(k) for k in ("kind", "joint", "t", "t_play", "value", "limit", "msg")} for v in r["violations"]]
    valid.append({"name": name, "playable": p, "ok": r["ok"], "duration": r["duration"],
                  "max_vel": r["max_vel"], "max_acc": r["max_acc"], "max_grip_vel": r.get("max_grip_vel"),
                  "transition": r["transition"], "violations": vs})

retimes = []
for name, p in cases:
    if name not in ("fast-nod", "fast-dance", "speed-2", "grip-fast", "linear-dance"):
        continue
    try:
        q = P.retime(p)
        retimes.append({"name": name, "playable": p, "ok": True, "t": [k["t"] for k in q["keyframes"]]})
    except ValueError as e:
        retimes.append({"name": name, "playable": p, "ok": False, "error": str(e)})

samples = []
for n in ("wave", "offset-start"):
    p = dict(cases)[n]
    s = P.sample(p)
    idx = list(range(0, len(s["t"]), 37)) + [len(s["t"]) - 1]
    samples.append({"name": n, "playable": p, "duration": s["duration"], "n": len(s["t"]),
                    "points": [{"t": s["t"][i], "q": s["q"][i], "grip": s["grip"][i]} for i in idx]})

fk = []
try:
    import numpy as np
    import pinocchio as pin
    m = pin.buildModelFromUrdf(URDF)
    d = m.createData()
    fid = m.getFrameId("gripper_tip")
    rng = np.random.default_rng(7)
    lo = [-2.5, 0.1, 0.1, -1.5, -1.4, -2.0]
    hi = [3.0, 3.5, 3.0, 1.4, 1.4, 2.0]
    qs = [("home", [0] * 6), ("ready", [0, 0.5, 0.8, 0, 0, 0]), ("graceful-bow-peak", [0, 1, 1.4, 0.7, 0, 0]),
          ("ready+j1", [0.5, 0.5, 0.8, 0, 0, 0]), ("ready+j2", [0, 0.8, 0.8, 0, 0, 0]),
          ("ready+j3", [0, 0.5, 1.1, 0, 0, 0]), ("ready+j4", [0, 0.5, 0.8, 0.3, 0, 0]),
          ("ready-j4", [0, 0.5, 0.8, -0.3, 0, 0]), ("ready+j5", [0, 0.5, 0.8, 0, 0.3, 0]),
          ("ready+j6", [0, 0.5, 0.8, 0, 0, 0.5])]
    qs += [(f"random-{i}", [float(x) for x in rng.uniform(lo, hi)]) for i in range(25)]
    for name, q in qs:
        qq = np.zeros(m.nq)
        qq[:6] = q
        pin.framesForwardKinematics(m, d, qq)
        fk.append({"name": name, "q": [float(x) for x in q],
                   "tip": [float(x) for x in d.oMf[fid].translation],
                   "gripper": [float(x) for x in d.oMf[m.getFrameId("gripper")].translation]})
except ImportError as e:
    print("pinocchio missing, FK references skipped:", e)

OUT.write_text(json.dumps({"generated_by": "scripts/make_reference.py", "envelope": P.envelope().describe(),
                           "validate": valid, "retime": retimes, "sample": samples, "fk": fk}, indent=1))
print(f"wrote {OUT}: {len(valid)} validate, {len(retimes)} retime, {len(samples)} sample, {len(fk)} fk")
for v in valid:
    print(f"  {v['name']:20s} ok={v['ok']!s:5} dur={v['duration']} kinds={sorted({x['kind'] for x in v['violations']})}")
for r in retimes:
    print("  retime", r["name"], r["ok"], r.get("t") or r.get("error")[:80])
