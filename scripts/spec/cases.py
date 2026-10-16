import json, glob, copy, random, sys
sys.path.insert(0, "/home/naman/openyam-robot-arm")
EX = {f.split('/')[-1][:-5]: json.load(open(f)) for f in sorted(glob.glob("/home/naman/openyam-playground/site/examples/*.json"))}
cases = [(f"example:{k}", v) for k, v in EX.items()]
def mut(name, base, fn):
    p = copy.deepcopy(EX[base]); fn(p); cases.append((name, p))
def kf(p, i): return p["keyframes"][i]
mut("j4 out of range", "nod", lambda p: kf(p,2)["q"].__setitem__(3, 1.6))
mut("j1 path out (keyframe in range)", "hello", lambda p: kf(p,1)["q"].__setitem__(0, 3.0))
mut("too fast", "nod", lambda p: [k.__setitem__("t", k["t"]/3) for k in p["keyframes"]])
mut("too fast at speed 2", "wave", lambda p: p.__setitem__("speed", 2))
mut("slow speed 0.5", "wave", lambda p: p.__setitem__("speed", 0.5))
mut("linear eases", "nod", lambda p: [k.__setitem__("ease","linear") for k in p["keyframes"]])
mut("hold jump", "hello", lambda p: kf(p,2)["q"].__setitem__(3, -0.25))
mut("hold small jump", "hello", lambda p: kf(p,2)["q"].__setitem__(3, -0.296))
mut("non monotonic t", "nod", lambda p: kf(p,3).__setitem__("t", 1.0))
mut("first t not 0", "nod", lambda p: kf(p,0).__setitem__("t", 0.2))
mut("loop 3 ok", "nod", lambda p: p.__setitem__("loop", 3))
mut("loop discontinuity", "nod", lambda p: (p.__setitem__("loop", 2), kf(p,-1)["q"].__setitem__(0, 0.2)))
mut("too long", "beat-dance", lambda p: p.__setitem__("loop", 2))
mut("offset start (transition)", "nod", lambda p: [k["q"].__setitem__(0, k["q"][0] + 0.3) for k in p["keyframes"]])
mut("start home", "hello", lambda p: p.__setitem__("start", "home"))
mut("fast gripper", "hello", lambda p: kf(p,1).__setitem__("t", 0.3))
mut("beat-dance at default caps", "beat-dance", lambda p: p.pop("caps"))
mut("unknown caps", "hello", lambda p: p.__setitem__("caps", "turbo"))
mut("version 2.0", "hello", lambda p: p.__setitem__("version", "2.0"))
mut("version 1.7 + unknown fields", "hello", lambda p: (p.__setitem__("version", "1.7"), p.__setitem__("color", "red"), kf(p,1).__setitem__("light", 1)))
mut("legacy no format/version", "hello", lambda p: (p.pop("format"), p.pop("version")))
mut("format without version", "hello", lambda p: p.pop("version"))
mut("bad name", "hello", lambda p: p.__setitem__("name", "Hello World"))
mut("bad ease", "hello", lambda p: kf(p,1).__setitem__("ease", "bounce"))
mut("grip 1.5", "hello", lambda p: kf(p,1).__setitem__("grip", 1.5))
mut("q 5 numbers", "hello", lambda p: kf(p,1)["q"].pop())
mut("cartesian", "hello", lambda p: p.__setitem__("space", "cartesian"))
mut("speed 0", "hello", lambda p: p.__setitem__("speed", 0))
mut("keyframe at home", "hello", lambda p: kf(p,1).__setitem__("q", [0,0,0,0,0,0]))
mut("rom-arm speed 1.2", "rom-arm", lambda p: p.__setitem__("speed", 1.2))
mut("happy-dance speed 1.6", "happy-dance", lambda p: p.__setitem__("speed", 1.6))
mut("look-around j6 1.95", "look-around", lambda p: kf(p,3)["q"].__setitem__(5, 1.95))
mut("odd end time", "hello", lambda p: kf(p,3).__setitem__("t", 4.6037))
random.seed(7)
for i in range(6):
    def r(p, i=i):
        for k in p["keyframes"][1:-1]:
            k["q"] = [round(x + random.uniform(-0.4, 0.4), 3) for x in k["q"]]
    mut(f"random jitter {i}", ["nod","wave","happy-dance","look-around","rom-arm","beat-dance"][i], r)
for nm in list(EX):
    for sp in (0.7, 1.1, 1.25):
        mut(f"{nm} speed {sp}", nm, lambda p, sp=sp: p.__setitem__("speed", sp))
random.seed(11)
for i, nm in enumerate(list(EX) * 2):
    def r2(p):
        for k in p["keyframes"][1:-1]:
            k["q"] = [round(x + random.uniform(-0.06, 0.06), 3) for x in k["q"]]
    mut(f"mild jitter {nm} {i}", nm, r2)
mut("bow from home", "bow", lambda p: p.__setitem__("start", "home"))
mut("bow dance caps", "bow", lambda p: (p.__setitem__("caps", "dance"), p.__setitem__("speed", 2)))
json.dump([{"name": n, "playable": p} for n, p in cases], open(sys.argv[1], "w"))
print(len(cases), "cases")
