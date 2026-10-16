"""Headless Firefox check of the running app (phone viewport) + screenshots.

  /home/naman/openyam-robot-arm/.venv/bin/python scripts/browser_check.py http://127.0.0.1:3311
Needs selenium + geckodriver. Saves docs/screenshots/*.png and prints a pass/fail list.
"""
import sys, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
import shutil
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3311"
OUT = Path(__file__).resolve().parents[1] / "docs/screenshots"
OUT.mkdir(parents=True, exist_ok=True)
results = []


def check(name, cond):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name)


opts = Options()
opts.add_argument("-headless")
d = webdriver.Firefox(options=opts, service=Service(shutil.which("geckodriver") or "/snap/bin/geckodriver"))
W = WebDriverWait(d, 20)


def phone():
    d.set_window_size(390, 844)


def shot(name, full=True):
    p = OUT / name
    if full:
        d.get_full_page_screenshot_as_file(str(p))
    else:
        d.save_screenshot(str(p))
    print("  saved", p)


def canvas_ok():
    # the WebGL canvas has non-uniform pixels (an arm was drawn)
    return d.execute_script("""
      const c = document.querySelector('.viewer canvas'); if (!c) return false;
      const g = document.createElement('canvas'); g.width = 64; g.height = 64;
      const x = g.getContext('2d'); x.drawImage(c, 0, 0, 64, 64);
      const px = x.getImageData(0, 0, 64, 64).data; let set = new Set();
      for (let i = 0; i < px.length; i += 4) set.add(px[i] + ',' + px[i+1] + ',' + px[i+2] + ',' + px[i+3]);
      return set.size > 20;""")


def no_hscroll():
    return d.execute_script("return document.documentElement.scrollWidth <= window.innerWidth + 1")


try:
    phone()
    d.get(BASE + "/")
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".viewer canvas")))
    time.sleep(2.5)
    check("home: 3D canvas renders the demo arm", canvas_ok())
    check("home: no horizontal scroll at 390px", no_hscroll())
    check("home: safety note shown", "checked against the arm" in d.page_source)
    shot("01-home-phone.png")

    ta = d.find_element(By.ID, "prompt")
    ta.send_keys("take a graceful bow")
    d.find_element(By.CSS_SELECTOR, "button[type=submit]").click()
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#result .badge.ok")))
    time.sleep(3)
    check("generate: result valid badge", True)
    check("generate: 3D canvas renders", canvas_ok())
    t = d.find_element(By.CSS_SELECTOR, ".time").text
    check(f"generate: playback clock advancing ({t})", not t.startswith("0.0 /"))
    d.execute_script("document.getElementById('result').scrollIntoView()")
    shot("02-generated-phone.png")

    d.find_element(By.XPATH, "//button[contains(., 'Save & get QR')]").click()
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".share .qr img")))
    time.sleep(1)
    url = d.find_element(By.CSS_SELECTOR, ".share .linkbox span").text
    check(f"save: share URL {url}", "/p/" in url)
    loaded = d.execute_script("const i=document.querySelector('.share .qr img'); return i.complete && i.naturalWidth > 0")
    check("save: QR image loaded", loaded)
    d.find_element(By.CSS_SELECTOR, "details summary").click()
    time.sleep(0.8)
    local = d.find_elements(By.CSS_SELECTOR, "details .linkbox span")[0].text
    check("save: offline /p/local# link present", "/p/local#" in local)
    shot("03-saved-qr-phone.png")

    d.get(url)
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".viewer canvas")))
    time.sleep(2.5)
    check("share page: canvas renders", canvas_ok())
    check("share page: QR + instructions", "Bring this to the arm" in d.page_source)
    check("share page: no horizontal scroll", no_hscroll())
    shot("04-share-page-phone.png")

    d.get(local)
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".viewer canvas")))
    time.sleep(2.5)
    check("local link: decoded and validated in the browser", "Inside the safe range" in d.page_source)
    check("local link: canvas renders", canvas_ok())
    shot("05-offline-link-phone.png")

    d.get(BASE + "/gallery")
    time.sleep(1)
    check("gallery: shows the saved motion", "take a graceful bow" in d.page_source)
    shot("06-gallery-phone.png")

    d.execute_script("localStorage.setItem('theme','dark')")
    d.get(BASE + "/")
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".viewer canvas")))
    time.sleep(2.5)
    bg = d.execute_script("return getComputedStyle(document.body).backgroundColor")
    check(f"dark theme applied ({bg})", bg in ("rgb(20, 19, 26)",))
    shot("07-home-dark-phone.png")
    d.get(url)
    time.sleep(2.5)
    shot("08-share-page-dark-phone.png")
    d.execute_script("localStorage.removeItem('theme')")

    d.set_window_size(1280, 900)
    d.get(BASE + "/")
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".viewer canvas")))
    d.find_element(By.XPATH, "//button[contains(@class,'chip') and contains(., 'victory')]").click()
    W.until(EC.presence_of_element_located((By.CSS_SELECTOR, "#result .badge.ok")))
    time.sleep(3)
    d.execute_script("window.scrollTo(0,0)")
    shot("09-desktop.png", full=False)
finally:
    d.quit()

bad = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(bad)}/{len(results)} checks passed")
sys.exit(1 if bad else 0)
