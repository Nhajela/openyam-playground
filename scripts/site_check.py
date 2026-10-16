"""Headless Firefox check of the static GitHub Pages site, served under a subpath like Pages.

  npm run build:site
  mkdir -p /tmp/www && ln -sfn "$PWD/site" /tmp/www/openyam-playground
  (cd /tmp/www && python3 -m http.server 8765 --bind 127.0.0.1) &
  /home/naman/openyam-robot-arm/.venv/bin/python scripts/site_check.py http://127.0.0.1:8765/openyam-playground/

Compares the viewer's verdicts with the lab's Python validator (armctl/playable.py), checks
animation, violation seek, #p= round trip (and a pasted playground /p/local# link), QR, phone
layout, and saves docs/screenshots/site-*.png.
"""
import copy, json, shutil, sys, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait

LAB = Path("/home/naman/openyam-robot-arm")
sys.path.insert(0, str(LAB))
from armctl import playable as P  # noqa: E402

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/openyam-playground/"
ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
OUT = ROOT / "docs/screenshots"
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))


def example(name):
    p = SITE / "examples" / f"{name}.json"
    if not p.exists():
        p = LAB / "playables" / f"{name}.json"
    return json.loads(p.read_text())


opts = Options()
opts.add_argument("-headless")
d = webdriver.Firefox(options=opts, service=Service(shutil.which("geckodriver") or "/snap/bin/geckodriver"))
W = WebDriverWait(d, 20)


def phone():
    d.set_window_size(390, 844)


def desktop():
    d.set_window_size(1280, 900)


def shot(name):
    d.get_full_page_screenshot_as_file(str(OUT / name))


def no_hscroll():
    return d.execute_script("return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")


def ds(key):
    return d.execute_script(f"return document.getElementById('result').dataset['{key}']")


def paste(obj_or_text):
    text = obj_or_text if isinstance(obj_or_text, str) else json.dumps(obj_or_text)
    d.execute_script("document.getElementById('src').value = arguments[0]; document.getElementById('check').click();", text)
    time.sleep(0.4)


def time_text():
    return d.find_element(By.ID, "time").text


try:
    # ---------- landing ----------
    phone()
    d.get(BASE)
    W.until(lambda _: d.find_element(By.TAG_NAME, "h1").text)
    check("index: renders hero", "your own AI" in d.find_element(By.TAG_NAME, "h1").text)
    prompt = d.find_element(By.ID, "prompt-text").text
    check("index: prompt points at spec/v1.md", "https://nhajela.github.io/openyam-playground/spec/v1.md" in prompt)
    d.find_element(By.ID, "idea").send_keys("a shy wave")
    check("index: idea fills the prompt", "a shy wave" in d.find_element(By.ID, "prompt-text").text)
    hrefs = [a.get_attribute("href") for a in d.find_elements(By.CSS_SELECTOR, "a")]
    check("index: links stay under the subpath", all(h.startswith(BASE) or h.startswith("https://github.com") or h.startswith("https://nhajela") for h in hrefs if h))
    check("index: phone has no horizontal scroll", no_hscroll())
    shot("site-index-phone.png")
    d.execute_script("document.documentElement.dataset.theme='dark'")
    time.sleep(0.2)
    shot("site-index-dark-phone.png")
    d.execute_script("document.documentElement.dataset.theme='light'")

    # ---------- viewer: examples ----------
    d.get(BASE + "viewer.html")
    W.until(lambda _: d.find_elements(By.CSS_SELECTOR, "#examples .chip"))
    chips = [c.text for c in d.find_elements(By.CSS_SELECTOR, "#examples .chip")]
    check("viewer: examples listed", len(chips) >= 3, ", ".join(chips))
    d.find_element(By.CSS_SELECTOR, '#examples .chip[data-file$="nod.json"]').click()
    W.until(lambda _: ds("verdict"))
    check("viewer: nod example loads", d.find_element(By.ID, "pname").text == "nod")
    t1 = time_text(); time.sleep(0.8); t2 = time_text()
    check("viewer: animates", t1 != t2 and ds("playing") == "true", f"{t1} -> {t2}")
    check("viewer: format badge", "openyam-playable 1.0" in d.find_element(By.ID, "fmt-badges").text)
    check("viewer: tip readout", "cm above table" in d.find_element(By.ID, "tip").text)
    check("viewer: 6 joint bars", len(d.find_elements(By.CSS_SELECTOR, "#joints .jrow")) == 6)
    W.until(lambda _: d.find_element(By.ID, "qr-box").get_attribute("data-state") == "ok")
    qr_w = d.execute_script("return document.getElementById('qr').width")
    check("viewer: QR renders", qr_w > 100, f"canvas {qr_w}px, {d.find_element(By.ID, 'qr-size').text}")
    nonblank = d.execute_script("""const c=document.getElementById('qr');const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let dark=0;for(let i=0;i<x.length;i+=4){if(x[i]<50)dark++};return dark""")
    check("viewer: QR has modules", nonblank > 1000)
    check("viewer: phone has no horizontal scroll", no_hscroll())
    time.sleep(0.5)
    shot("site-viewer-phone.png")

    # ---------- validator parity with the lab ----------
    nod, wave, dance = example("nod"), example("wave"), example("beat-dance")
    oob = copy.deepcopy(nod); oob["keyframes"][3]["q"][1] = 3.7
    fast = copy.deepcopy(nod)
    for k in fast["keyframes"]:
        k["t"] = round(k["t"] * 0.4, 3)
    v2 = copy.deepcopy(wave); v2["format"] = "openyam-playable"; v2["version"] = "2.0"
    legacy = copy.deepcopy(nod); legacy.pop("format", None); legacy.pop("version", None)
    nocaps = copy.deepcopy(dance); nocaps.pop("caps", None)
    cases = [("nod", nod, None), ("wave", wave, None), ("beat-dance", dance, None),
             ("out-of-range", oob, None), ("too-fast", fast, None), ("beat-dance-without-dance-caps", nocaps, None),
             ("legacy-no-version", legacy, None), ("major-2.0", v2, "refused")]
    for name, p, expect in cases:
        py = P.validate(copy.deepcopy(p))
        paste(p)
        verdict, joint_ok, fmt = ds("verdict"), ds("jointOk"), ds("formatStatus")
        if expect == "refused":
            check(f"parity {name}: viewer refuses, lab python ok={py['ok']} ({py['violations'][0]['kind']})",
                  verdict == "refused" and fmt == "refused" and py["ok"] is False, verdict)
        else:
            check(f"parity {name}: viewer joint ok={joint_ok} vs lab python ok={py['ok']} ({len(py['violations'])} violations)",
                  joint_ok == str(py["ok"]).lower(), f"verdict={verdict} format={fmt}")
        if name == "legacy-no-version":
            check("legacy: badge shown", "legacy (no version field)" in d.find_element(By.ID, "fmt-badges").text)
        if name == "out-of-range":
            listed = d.find_element(By.ID, "violations").text
            check("out-of-range: every lab violation listed", all(v["msg"] in listed for v in py["violations"]),
                  f"{len(py['violations'])} lab + tip-check items")
            check("out-of-range: j2 bar flagged", "out" in d.find_elements(By.CSS_SELECTOR, "#joints .jrow")[1].get_attribute("class"))
            shot("site-viewer-invalid-phone.png")
        if name == "too-fast":
            btns = d.find_elements(By.CSS_SELECTOR, "#violations .vlink")
            btn = max(btns, key=lambda b: float(b.find_element(By.CSS_SELECTOR, ".vt").text.split()[0]))
            target = float(btn.find_element(By.CSS_SELECTOR, ".vt").text.split()[0])
            check("violation times come from the lab's t_play", any(abs(v["t_play"] - target) < 0.006 for v in py["violations"] if v.get("t_play") is not None))
            d.execute_script("arguments[0].scrollIntoView({block:'center'})", btn)
            btn.click()
            time.sleep(0.3)
            check("violation click seeks + pauses", ds("playing") == "false" and time_text().startswith(f"{target:.1f}"), f"{time_text()} vs t_play {target}")

    # ---------- share link round trip ----------
    paste(dance)
    link = d.find_element(By.ID, "share-link").text
    check("share link is viewer.html#p=", link.startswith(BASE + "viewer.html#p="))
    h = d.execute_script("return location.hash")
    check("address bar carries #p=", link.endswith(h))
    d.get("about:blank")
    d.get(link)
    W.until(lambda _: ds("verdict"))
    check("hash link round-trips (name, caps, verdict)", d.find_element(By.ID, "pname").text == dance["name"]
          and "caps: dance" in d.find_element(By.ID, "fmt-badges").text and ds("verdict") == "pass", ds("verdict"))
    payload = link.split("#p=")[1]
    d.get(BASE + "viewer.html")
    W.until(lambda _: d.find_elements(By.CSS_SELECTOR, "#examples .chip"))
    paste("https://playground.example/p/local#" + payload)
    check("pasted playground /p/local# link loads", d.find_element(By.ID, "pname").text == dance["name"] and ds("verdict") == "pass")
    # the payload decodes in Python exactly like the lab station would decode /p/local#
    import base64, zlib
    data = json.loads(zlib.decompress(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4))))
    check("payload decodes with python zlib+base64url", data["v"] == 1 and data["playable"]["caps"] == "dance"
          and data["playable"]["version"] == "1.0")
    check("python validator agrees on the decoded payload", P.validate(data["playable"])["ok"] is True)

    # big payload warning
    big = copy.deepcopy(wave)
    kf = big["keyframes"]
    import random
    rnd = random.Random(3)
    big["keyframes"] = [kf[0]] + [{"t": round(0.6 + i * 0.6, 3), "q": [round(rnd.uniform(-0.1, 0.1), 6), round(0.5 + rnd.uniform(-0.1, 0.1), 6),
                        round(0.8 + rnd.uniform(-0.1, 0.1), 6), round(rnd.uniform(-0.1, 0.1), 6), 0.0, 0.0], "ease": "cubic"} for i in range(70)]
    paste(big)
    warn = d.find_element(By.ID, "qr-warn")
    check("QR size warning above ~2,000 bytes", warn.is_displayed(), d.find_element(By.ID, "qr-size").text)

    # ---------- desktop + dark ----------
    desktop()
    d.get(BASE + "viewer.html#p=" + payload)
    W.until(lambda _: ds("verdict"))
    time.sleep(1.5)
    shot("site-viewer-desktop.png")
    d.execute_script("document.documentElement.dataset.theme='dark'")
    time.sleep(0.4)
    shot("site-viewer-dark-desktop.png")
    d.execute_script("document.documentElement.dataset.theme='light'")
    d.get(BASE)
    time.sleep(0.3)
    shot("site-index-desktop.png")
    d.get(BASE + "404.html")
    check("404 page renders", "can't reach" in d.find_element(By.TAG_NAME, "h1").text)
    logs_ok = True
finally:
    d.quit()

failed = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
