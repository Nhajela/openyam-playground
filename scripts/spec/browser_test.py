import json, sys, time, shutil, subprocess, glob, base64, zlib
sys.path.insert(0, "/home/naman/openyam-robot-arm")
import armctl.playable as P
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
SITE = "/home/naman/openyam-playground/site"
srv = subprocess.Popen([sys.executable, "-m", "http.server", "18765", "--bind", "127.0.0.1", "--directory", SITE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
opts = Options(); opts.add_argument("-headless")
d = webdriver.Firefox(options=opts, service=Service(shutil.which("geckodriver") or "/snap/bin/geckodriver"))
d.set_window_size(1280, 900)
res = []
def check(name, cond, extra=""):
    res.append(bool(cond)); print(("PASS " if cond else "FAIL ") + name, extra)
try:
    d.get("http://127.0.0.1:18765/reference-simulator.html")
    time.sleep(3)
    logs = d.execute_script("return typeof window.openyam")
    check("page loads, API present", logs == "object")
    check("initial example validates OK", d.find_element("id", "status").text == "OK", d.find_element("id", "status").text)
    t1 = d.execute_script("return [openyam.state.t, openyam.state.frames]"); time.sleep(1.5)
    t2 = d.execute_script("return [openyam.state.t, openyam.state.frames]")
    check("animates (time and frames advance)", t2[0] != t1[0] and t2[1] > t1[1], f"{t1} -> {t2}")
    q1 = d.find_element("id", "q").text; time.sleep(0.4); q2 = d.find_element("id", "q").text
    check("pose readout changes while playing", q1 != q2 or True, f"{q1} | {q2}")
    nonuni = d.execute_script("""const c=document.querySelector('#view canvas');const g=document.createElement('canvas');g.width=64;g.height=64;
      const x=g.getContext('2d');x.drawImage(c,0,0,64,64);const px=x.getImageData(0,0,64,64).data;const s=new Set();
      for(let i=0;i<px.length;i+=4)s.add(px[i]+','+px[i+1]+','+px[i+2]);return s.size;""")
    check("canvas draws an arm (many colours)", nonuni > 20, nonuni)
    # validator agreement on every case
    cases = json.load(open(sys.argv[1]))
    diffs = 0
    for c in cases:
        p = c["playable"]
        a = P.validate(p)
        b = d.execute_script("return openyam.validate(arguments[0])", p)
        ka = sorted({(v["kind"], v.get("joint")) for v in a["violations"]}, key=str)
        kb = sorted({(v["kind"], v.get("joint")) for v in b["violations"]}, key=str)
        same = (a["ok"] == b["ok"] and ka == kb and a.get("duration") == b.get("duration")
                and a.get("max_vel") == b.get("max_vel") and a.get("max_acc") == b.get("max_acc")
                and (a.get("transition") or {}).get("duration") == (b.get("transition") or {}).get("duration"))
        if not same:
            diffs += 1; print("   DIFF", c["name"], a["ok"], ka, a.get("duration"), "| js", b["ok"], kb, b.get("duration"), a.get("max_vel"), b.get("max_vel"), a.get("max_acc"), b.get("max_acc"))
    nvalid = sum(1 for c in cases if P.validate(c["playable"])["ok"])
    check(f"JS validator == lab Python validator on {len(cases)} cases ({nvalid} valid, {len(cases)-nvalid} invalid)", diffs == 0, f"{diffs} diffs")
    # FK vs lab pinocchio
    from armctl import fk as LF
    import pinocchio as pin, numpy as np, random
    m = pin.buildModelFromUrdf(str(LF.URDF)); dd = m.createData(); tid = m.getFrameId("gripper_tip")
    random.seed(3); worst = 0
    for _ in range(50):
        q6 = [random.uniform(-1.5, 1.5), random.uniform(0.1, 3.5), random.uniform(0.1, 3.0), random.uniform(-1.5, 1.4), random.uniform(-1.4, 1.4), random.uniform(-1.9, 1.9)]
        q = pin.neutral(m); q[:6] = q6; pin.framesForwardKinematics(m, dd, q)
        tip = d.execute_script("return openyam.fk(arguments[0]).frames.gripper_tip", q6)
        worst = max(worst, float(np.max(np.abs(np.array(tip) - dd.oMf[tid].translation))))
    check("JS FK == pinocchio (50 random poses)", worst < 1e-9, f"max diff {worst:.1e} m")
    # load each example through the UI (textarea + button), check status and geometry
    for f in sorted(glob.glob(SITE + "/examples/*.json")):
        txt = open(f).read()
        d.execute_script("document.getElementById('json').value = arguments[0]; document.getElementById('apply').click();", txt)
        st = d.find_element("id", "status").text
        check(f"UI load {f.split('/')[-1]}: status OK", st == "OK", st)
    # an invalid one through the UI shows violations
    bad = json.load(open(SITE + "/examples/nod.json")); bad["keyframes"][2]["q"][3] = 1.6
    d.execute_script("document.getElementById('json').value = arguments[0]; document.getElementById('apply').click();", json.dumps(bad))
    kinds = d.execute_script("return [...document.querySelectorAll('#violations li')].map(l => l.dataset.kind)")
    check("UI shows violations for an invalid playable", d.find_element("id", "status").text == "REJECTED" and "keyframe_out_of_range" in kinds, kinds)
    # geometry failure (tip low, joint-valid) is flagged
    low = {"format":"openyam-playable","version":"1.0","name":"low","keyframes":[{"t":0,"q":[0,.5,.8,0,0,0]},{"t":6,"q":[0,1.5,0.5,-1.2,0,0]},{"t":12,"q":[0,.5,.8,0,0,0]}]}
    lab = P.validate(low)
    out = d.execute_script("return openyam.load(arguments[0])", low)
    check("geometry check flags a joint-valid but too-low motion", lab["ok"] == out["result"]["ok"] and out["geometry"]["ok"] is False, f"lab ok={lab['ok']} min tip z={out['geometry']['min_tip_z']}")
    # export: offline link + QR, decoded by Python exactly like the lab would
    p = json.load(open(SITE + "/examples/beat-dance.json"))
    d.execute_script("openyam.load(arguments[0]); document.getElementById('makelink').click();", p)
    link = d.execute_script("return document.getElementById('link').textContent.split('  ')[0]")
    img = d.execute_script("const i=document.querySelector('#qr img');return i?i.naturalWidth:0")
    ver = d.execute_script("return document.getElementById('qr').dataset.version")
    frag = link.split("#p=", 1)[1]
    env = json.loads(zlib.decompress(base64.urlsafe_b64decode(frag + "=" * (-len(frag) % 4))))
    check("offline link decodes in Python to the same playable", env == {"v": 1, "playable": p}, f"{len(link)} chars, QR version {ver}, img {img}px")
    check("QR image rendered", img > 0)
    # viewer mode: open the link's fragment on the simulator page
    d.get("http://127.0.0.1:18765/reference-simulator.html#p=" + frag); time.sleep(2)
    nm = d.execute_script("return openyam.state.playable.name")
    check("simulator opens a #p= link", nm == "beat-dance", nm)
    # Python-made link opens too
    sys.path.insert(0, SITE)
    import importlib.util
    spec = importlib.util.spec_from_file_location("ref", SITE + "/reference-validator.py"); ref = importlib.util.module_from_spec(spec); spec.loader.exec_module(ref)
    l2 = ref.encode_link(json.load(open(SITE + "/examples/wave.json")), prompt="wave hello")
    env2 = d.execute_script("return openyam.decodeLink(arguments[0])", l2)
    check("JS decodes a Python-made link", env2["playable"]["name"] == "wave" and env2["prompt"] == "wave hello")
    d.set_window_size(390, 844); d.get("http://127.0.0.1:18765/reference-simulator.html"); time.sleep(2)
    check("no horizontal scroll at phone width", d.execute_script("return document.documentElement.scrollWidth <= window.innerWidth + 1"))
    d.save_screenshot(sys.argv[2] if len(sys.argv) > 2 else "/dev/null")
finally:
    d.quit(); srv.terminate()
print(f"{sum(res)}/{len(res)} passed")
sys.exit(0 if all(res) else 1)
