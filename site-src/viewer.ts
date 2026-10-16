/**
 * Static playable viewer (site/viewer.html): paste / drop / example / #p= link -> version gate,
 * the lab validator (TypeScript port, src/lib/arm), FK tip check, 3D replay, joint ranges, export + QR.
 * Everything runs in the browser; nothing is uploaded.
 */
import QRCode from "qrcode";
import { checkFormat, type FormatVerdict } from "../src/lib/arm/format";
import { CAP_PRESETS, capPreset, sample, validate, withCaps, type Playable, type ValidationResult } from "../src/lib/arm/playable";
import { checkGeometry, forwardKinematics, TABLE_Z_MIN, type GeometryReport } from "../src/lib/arm/kinematics";
import { ENVELOPE, JOINTS, SOFT_LIMITS, URDF_LIMITS, VEL_CAP, ACC_CAP } from "../src/lib/arm/envelope";
import { createArmScene, poseAt, tipTrail, type ArmScene } from "../src/lib/arm/scene";
import { decodeLocal, encodeLocal } from "../src/lib/codec";
import { copyButton, initThemeToggle } from "./common";

declare const __EXAMPLES__: string[];

const QR_WARN_BYTES = 2000;
const QR_MAX_BYTES = 2900; // byte-mode capacity at error level L is 2953

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

type Samples = ReturnType<typeof sample>;
interface Loaded {
  playable: Playable;
  prompt?: string;
  source: string;
  format: FormatVerdict;
  validation: ValidationResult | null;
  geometry: GeometryReport | null;
  samples: Samples | null;
}

let current: Loaded | null = null;
let scene: ArmScene | null = null;
let t = 0;
let playing = false;
let rate = 1;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

initThemeToggle();

// ---------- input parsing ----------

/** Pull a #p= / p/local# payload out of a URL, a bare fragment, or a raw payload. */
function payloadFrom(text: string): string | null {
  const s = text.trim();
  const hash = s.includes("#") ? s.slice(s.indexOf("#") + 1) : s;
  const frag = hash.replace(/^p=/, "").trim();
  return /^[A-Za-z0-9_-]{16,}$/.test(frag) ? frag : null;
}

function parseInput(text: string): { playable: Playable; prompt?: string; source: string } {
  const s = text.trim();
  if (!s) throw new Error("Paste a playable's JSON, a share link, or drop a .json file.");
  if (s.startsWith("{")) {
    let data: unknown;
    try {
      data = JSON.parse(s);
    } catch (e) {
      throw new Error(`That isn't valid JSON: ${(e as Error).message}`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The JSON must be an object.");
    // A share wrapper ({"v":1,"playable":{...}}) is accepted too.
    const d = data as Record<string, unknown>;
    if (d.v === 1 && d.playable && typeof d.playable === "object") {
      return { playable: d.playable as Playable, prompt: typeof d.prompt === "string" ? d.prompt : undefined, source: "pasted JSON (share wrapper)" };
    }
    return { playable: d as Playable, source: "pasted JSON" };
  }
  const payload = payloadFrom(s);
  if (!payload) throw new Error("That doesn't look like JSON or a playable link (viewer.html#p=... or /p/local#...).");
  let share;
  try {
    share = decodeLocal(payload);
  } catch (e) {
    throw new Error(`Couldn't read that link: ${(e as Error).message}`);
  }
  return { playable: share.playable, prompt: share.prompt, source: "share link" };
}

// ---------- analysis ----------

function analyse(input: { playable: Playable; prompt?: string; source: string }): Loaded {
  const format = checkFormat(input.playable);
  const out: Loaded = { ...input, format, validation: null, geometry: null, samples: null };
  if (format.status === "refused") return out;
  out.validation = validate(input.playable);
  if (out.validation.duration !== null) {
    try {
      out.samples = withCaps(input.playable, () => sample(input.playable));
      out.geometry = checkGeometry(out.samples, input.playable.keyframes);
    } catch {
      out.samples = null;
    }
  }
  return out;
}

// ---------- rendering helpers ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function badge(cls: string, text: string, title?: string): HTMLElement {
  const b = el("span", { class: `badge ${cls}` }, text);
  if (title) b.title = title;
  return b;
}

const fmt = (x: number, d = 2) => (Math.abs(x) < 0.5 * 10 ** -d ? (0).toFixed(d) : x.toFixed(d));

function shareUrl(l: Loaded): string {
  const payload = encodeLocal({ v: 1, ...(l.prompt ? { prompt: l.prompt } : {}), playable: l.playable });
  return new URL(`viewer.html#p=${payload}`, window.location.href).href;
}

function prettyJson(p: Playable): string {
  // keyframes one per line keeps it readable without exploding q arrays
  const { keyframes, ...rest } = p;
  const head = JSON.stringify(rest, null, 2).replace(/\n}$/, "");
  const kfs = (keyframes ?? []).map((k) => "    " + JSON.stringify(k)).join(",\n");
  return `${head}${Object.keys(rest).length ? "," : ""}\n  "keyframes": [\n${kfs}\n  ]\n}\n`;
}

// ---------- main render ----------

function render(l: Loaded) {
  current = l;
  const result = $("result");
  result.hidden = false;
  const p = l.playable;
  $("pname").textContent = typeof p.name === "string" && p.name ? p.name : "(unnamed playable)";
  const notes = [l.prompt ? `“${l.prompt}”` : "", typeof p.notes === "string" ? p.notes : ""].filter(Boolean).join(" ");
  $("pnotes").textContent = notes;
  $("pnotes").hidden = !notes;
  $("psource").textContent = `Loaded from ${l.source}.`;

  // format badge + compat verdict
  const fb = $("fmt-badges");
  fb.replaceChildren();
  if (l.format.status === "ok") fb.append(badge("neutral", `openyam-playable ${l.format.version}`), badge("ok", "compatible"));
  else if (l.format.status === "legacy") fb.append(badge("warn", "legacy (no version field)", "Read as format 1.0. Add \"format\": \"openyam-playable\", \"version\": \"1.0\".") , badge("ok", "compatible"));
  else fb.append(badge("bad", l.format.version ? `version ${l.format.version}` : "unknown format"), badge("bad", "not compatible"));
  const preset = capPreset(p);
  if (preset && preset !== "default") fb.append(badge("neutral", `caps: ${preset}`));
  $("fmt-msg").textContent = l.format.msg;

  // verdict
  const v = l.validation, g = l.geometry;
  const jointOk = !!v?.ok;
  const geoOk = !!g?.ok;
  const verdict = l.format.status === "refused" ? "refused" : jointOk && geoOk ? "pass" : "fail";
  result.dataset.verdict = verdict;
  result.dataset.jointOk = String(jointOk);
  result.dataset.geometryOk = String(geoOk);
  result.dataset.formatStatus = l.format.status;
  const vb = $("verdict");
  vb.replaceChildren();
  if (verdict === "refused") {
    vb.append(badge("bad", "Refused"));
    vb.append(el("p", { class: "verdict-text" }, `The lab won't run this: ${l.format.msg}. This viewer reads format 1.x only.`));
  } else if (verdict === "pass") {
    vb.append(badge("ok", "✓ Passes all checks"));
    vb.append(el("p", { class: "verdict-text" }, "Inside the joint limits, speed caps and workspace. The lab will re-check it before anyone presses Play."));
  } else {
    const n = (v?.violations.length ?? 0) + (g?.violations.length ?? 0);
    vb.append(badge("bad", `Needs changes: ${n} problem${n === 1 ? "" : "s"}`));
    vb.append(el("p", { class: "verdict-text" }, "The lab station would refuse this as it is. Click a problem to jump to it."));
  }
  const checks = $("checks");
  checks.replaceChildren(
    checkRow("Joint check (lab validator)", verdict === "refused" ? null : jointOk),
    checkRow(`Tip check (stays above ${TABLE_Z_MIN * 100} cm, not behind the base)`, verdict === "refused" || !g ? null : geoOk),
  );

  // stats
  const caps = preset ? CAP_PRESETS[preset] : null;
  const velCap = caps ? caps[0] : VEL_CAP, accCap = caps ? caps[1] : ACC_CAP;
  const peakVel = v?.max_vel ? Math.max(...v.max_vel) : null;
  const peakAcc = v?.max_acc ? Math.max(...v.max_acc) : null;
  $("stats").replaceChildren(
    stat(v?.duration != null ? `${v.duration.toFixed(1)} s` : "–", "duration (60 s max)"),
    stat(peakVel !== null ? fmt(peakVel) : "–", `peak rad/s (cap ${velCap})`, peakVel !== null && peakVel > velCap + 1e-9),
    stat(peakAcc !== null ? fmt(peakAcc) : "–", `peak rad/s² (cap ${accCap})`, peakAcc !== null && peakAcc > accCap + 1e-9),
    stat(g ? `${(g.min_z * 100).toFixed(1)} cm` : "–", `lowest tip (min ${TABLE_Z_MIN * 100} cm)`, !!g && g.min_z < TABLE_Z_MIN),
  );

  // violations
  const list = $("violations");
  list.replaceChildren();
  const items: { msg: string; t: number | null; kind: string }[] = [
    ...(v?.violations ?? []).map((x) => ({ msg: x.msg, t: x.t_play, kind: x.kind })),
    ...(g?.violations ?? []).map((x) => ({ msg: x.msg, t: x.t_play, kind: x.kind })),
  ];
  if (l.format.status === "refused") items.unshift({ msg: l.format.msg, t: null, kind: "version" });
  const MAX = 30;
  for (const it of items.slice(0, MAX)) {
    const li = el("li");
    if (it.t !== null && l.samples) {
      const b = el("button", { type: "button", class: "vlink" });
      b.append(el("span", { class: "vt" }, `${it.t.toFixed(2)} s`), document.createTextNode(it.msg));
      b.addEventListener("click", () => {
        seek(it.t as number);
        setPlaying(false);
        const stage = $("stage");
        const r = stage.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) stage.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      });
      li.append(b);
    } else {
      li.append(el("span", { class: "vt muted" }, it.kind), document.createTextNode(it.msg));
    }
    list.append(li);
  }
  if (items.length > MAX) list.append(el("li", { class: "muted" }, `and ${items.length - MAX} more`));
  $("violations-wrap").hidden = !items.length;

  renderJoints(l);
  renderExport(l);

  // 3D
  if (!scene) scene = createArmScene($("stage"));
  scene.setBad([...new Set((v?.violations ?? []).map((x) => x.joint ?? "").filter(Boolean))]);
  scene.setTrail(l.samples ? tipTrail(l.samples.q) : []);
  const D = l.samples?.duration ?? 0;
  $<HTMLInputElement>("scrub").disabled = !l.samples;
  $<HTMLButtonElement>("play").disabled = !l.samples;
  $("stage").classList.toggle("dim", !l.samples);
  $("stage-msg").textContent = l.samples ? "" : verdict === "refused" ? "Not shown: unsupported version." : "Can't animate: fix the schema problems first.";
  t = 0;
  seek(0);
  setPlaying(!!l.samples && !reduceMotion);
  $("time").dataset.duration = String(D);
}

function checkRow(label: string, ok: boolean | null): HTMLElement {
  const li = el("li", { class: ok === null ? "skip" : ok ? "pass" : "fail" });
  li.append(el("span", { class: "mark", "aria-hidden": "true" }, ok === null ? "–" : ok ? "✓" : "✕"), document.createTextNode(` ${label}: ${ok === null ? "not run" : ok ? "pass" : "fail"}`));
  return li;
}

function stat(value: string, label: string, bad = false): HTMLElement {
  const d = el("div", { class: `stat${bad ? " bad" : ""}` });
  d.append(el("b", {}, value), el("span", {}, label));
  return d;
}

// ---------- joint range bars ----------

let jointMarkers: HTMLElement[] = [];
let jointValues: HTMLElement[] = [];

function renderJoints(l: Loaded) {
  const wrap = $("joints");
  wrap.replaceChildren();
  jointMarkers = [];
  jointValues = [];
  const qs = l.samples?.q ?? (Array.isArray(l.playable.keyframes) ? l.playable.keyframes.map((k) => k.q).filter((q) => Array.isArray(q) && q.length === 6) : []);
  JOINTS.forEach((name, j) => {
    const [ulo, uhi] = URDF_LIMITS[j];
    const [slo, shi] = SOFT_LIMITS[j];
    const span = uhi - ulo;
    const pct = (x: number) => `${(Math.min(Math.max((x - ulo) / span, 0), 1) * 100).toFixed(2)}%`;
    let lo = Infinity, hi = -Infinity;
    for (const q of qs) { lo = Math.min(lo, q[j]); hi = Math.max(hi, q[j]); }
    const has = Number.isFinite(lo);
    const out = has && (lo < slo - 1e-9 || hi > shi + 1e-9);
    const row = el("div", { class: `jrow${out ? " out" : ""}` });
    const head = el("div", { class: "jhead" });
    const value = el("span", { class: "jval" }, "");
    head.append(el("b", {}, name), el("span", { class: "jrange" }, has ? `used ${fmt(lo)} … ${fmt(hi)} rad` : "no motion"), value);
    const bar = el("div", { class: "jbar", role: "img", "aria-label": `${name}: uses ${has ? `${fmt(lo)} to ${fmt(hi)}` : "nothing"} radians; soft limits ${fmt(slo)} to ${fmt(shi)}${out ? "; outside the soft limits" : ""}` });
    const soft = el("div", { class: "jsoft" });
    soft.style.left = pct(slo);
    soft.style.width = `calc(${pct(shi)} - ${pct(slo)})`;
    bar.append(soft);
    if (has) {
      const used = el("div", { class: "jused" });
      used.style.left = pct(lo);
      used.style.width = `max(3px, calc(${pct(hi)} - ${pct(lo)}))`;
      bar.append(used);
    }
    const mk = el("div", { class: "jmark" });
    bar.append(mk);
    jointMarkers.push(mk);
    jointValues.push(value);
    const ticks = el("div", { class: "jticks" });
    ticks.append(el("span", {}, fmt(slo)), el("span", {}, fmt(shi)));
    row.append(head, bar, ticks);
    wrap.append(row);
  });
}

function updateJointMarkers(q: number[]) {
  q.forEach((x, j) => {
    const [ulo, uhi] = URDF_LIMITS[j];
    const f = Math.min(Math.max((x - ulo) / (uhi - ulo), 0), 1);
    if (jointMarkers[j]) jointMarkers[j].style.left = `${(f * 100).toFixed(2)}%`;
    if (jointValues[j]) jointValues[j].textContent = `${fmt(x)}`;
  });
}

// ---------- export ----------

let shareLink = "";

function renderExport(l: Loaded) {
  const json = prettyJson(l.playable);
  const dl = $<HTMLAnchorElement>("download");
  if (dl.href.startsWith("blob:")) URL.revokeObjectURL(dl.href);
  dl.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  dl.download = `${typeof l.playable.name === "string" && /^[a-z0-9-]+$/.test(l.playable.name) ? l.playable.name : "playable"}.json`;
  $("json-out").textContent = json;

  shareLink = shareUrl(l);
  $("share-link").textContent = shareLink;
  const bytes = new TextEncoder().encode(shareLink).length;
  const size = $("qr-size");
  size.textContent = `${bytes.toLocaleString()} bytes in the link`;
  const warn = $("qr-warn");
  const canvas = $<HTMLCanvasElement>("qr");
  if (bytes > QR_MAX_BYTES) {
    warn.hidden = false;
    warn.className = "error";
    warn.textContent = "Too big for a QR code. Use fewer keyframes, round angles to 2-3 decimals, or shorten the notes; or bring the JSON file instead.";
    canvas.hidden = true;
    $("qr-box").dataset.state = "too-big";
    return;
  }
  warn.hidden = bytes <= QR_WARN_BYTES;
  warn.className = "warnbox";
  warn.textContent = "Big QR (over 2,000 bytes): phones may struggle to scan it. Fewer keyframes, angles rounded to 2-3 decimals and shorter notes make it smaller.";
  canvas.hidden = false;
  QRCode.toCanvas(canvas, shareLink, { errorCorrectionLevel: "L", margin: 2, width: 560, color: { dark: "#111111", light: "#ffffff" } })
    .then(() => { $("qr-box").dataset.state = "ok"; })
    .catch((e: Error) => {
      canvas.hidden = true;
      warn.hidden = false;
      warn.className = "error";
      warn.textContent = `Couldn't make a QR code: ${e.message}`;
      $("qr-box").dataset.state = "error";
    });
}

// ---------- playback ----------

function seek(time: number) {
  const s = current?.samples;
  const D = s?.duration ?? 0;
  t = Math.min(Math.max(time, 0), D);
  const scrub = $<HTMLInputElement>("scrub");
  scrub.value = D ? String(Math.round((t / D) * 1000)) : "0";
  $("time").textContent = `${t.toFixed(1)} / ${D.toFixed(1)} s`;
  if (!s || !scene) {
    const q = ENVELOPE.poses.ready;
    scene?.setPose(q, 0);
    updateJointMarkers(q);
    updateTip(q);
    return;
  }
  const p = poseAt(s, t);
  scene.setPose(p.q, p.grip);
  updateJointMarkers(p.q);
  updateTip(p.q);
}

function updateTip(q: number[]) {
  const z = forwardKinematics(q).tip[2];
  const tip = $("tip");
  tip.textContent = `tip ${(z * 100).toFixed(1)} cm above table`;
  tip.classList.toggle("low", z < TABLE_Z_MIN);
}

const PLAY_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L7.5 2.64A1 1 0 0 0 6 3.5z" fill="currentColor"/></svg>';
const PAUSE_ICON = '<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="4.5" height="14" rx="1.5" fill="currentColor"/><rect x="11.5" y="3" width="4.5" height="14" rx="1.5" fill="currentColor"/></svg>';

function setPlaying(on: boolean) {
  playing = on;
  const b = $("play");
  b.innerHTML = on ? PAUSE_ICON : PLAY_ICON;
  b.setAttribute("aria-label", on ? "Pause" : "Play");
  $("result").dataset.playing = String(on);
}

let last: number | null = null;
function tick(now: number) {
  requestAnimationFrame(tick);
  const s = current?.samples;
  if (playing && s) {
    if (last !== null) t += ((now - last) / 1000) * rate;
    if (t >= s.duration) {
      if ($<HTMLInputElement>("repeat").checked) t = 0;
      else { t = s.duration; setPlaying(false); }
    }
    seek(t);
  }
  last = now;
}
requestAnimationFrame(tick);

$("play").addEventListener("click", () => {
  const s = current?.samples;
  if (!s) return;
  if (!playing && t >= s.duration - 1e-3) seek(0);
  setPlaying(!playing);
});
$("scrub").addEventListener("input", (e) => {
  const D = current?.samples?.duration ?? 0;
  seek((Number((e.target as HTMLInputElement).value) / 1000) * D);
});
$("rate").addEventListener("change", (e) => { rate = Number((e.target as HTMLSelectElement).value) || 1; });

// ---------- loading ----------

function showError(msg: string | null) {
  const e = $("load-error");
  e.hidden = !msg;
  e.textContent = msg ?? "";
}

function load(text: string, opts: { updateHash?: boolean; fromHash?: boolean } = {}) {
  try {
    const input = parseInput(text);
    if (opts.fromHash) input.source = "the link in this page's address";
    const l = analyse(input);
    showError(null);
    render(l);
    if (opts.updateHash !== false) {
      try {
        history.replaceState(null, "", `#p=${new URL(shareLink).hash.replace(/^#p=/, "")}`);
      } catch {
        /* ignore */
      }
    }
    $("sr-status").textContent = `Loaded ${l.playable.name ?? "playable"}: ${$("result").dataset.verdict}`;
  } catch (e) {
    showError((e as Error).message);
  }
}

$("check").addEventListener("click", () => load($<HTMLTextAreaElement>("src").value));
$("src").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") load($<HTMLTextAreaElement>("src").value);
});

async function loadFile(f: File) {
  const text = await f.text();
  $<HTMLTextAreaElement>("src").value = text;
  load(text);
  if (current) current.source = `the file ${f.name}`;
  $("psource").textContent = `Loaded from the file ${f.name}.`;
}
$<HTMLInputElement>("file").addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void loadFile(f);
});
const drop = $("drop");
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = (e as DragEvent).dataTransfer?.files?.[0];
  if (f) void loadFile(f);
  else {
    const txt = (e as DragEvent).dataTransfer?.getData("text/plain");
    if (txt) { $<HTMLTextAreaElement>("src").value = txt; load(txt); }
  }
});

copyButton($("copy-json"), () => (current ? prettyJson(current.playable) : ""), "JSON copied");
copyButton($("copy-link"), () => shareLink, "Link copied");

// ---------- examples ----------

type ExampleEntry = { file: string; title: string };

async function listExamples(): Promise<ExampleEntry[]> {
  try {
    const r = await fetch("examples/index.json", { cache: "no-cache" });
    if (r.ok) {
      const data: unknown = await r.json();
      const arr = Array.isArray(data) ? data : Array.isArray((data as { examples?: unknown[] })?.examples) ? (data as { examples: unknown[] }).examples : [];
      const out: ExampleEntry[] = [];
      for (const x of arr) {
        if (typeof x === "string") out.push({ file: x, title: x.replace(/\.json$/, "") });
        else if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          const file = (o.file ?? o.path ?? o.href ?? o.url) as string | undefined;
          const name = typeof o.name === "string" ? o.name : undefined;
          const f = typeof file === "string" ? file : name ? `${name}.json` : undefined;
          if (f) out.push({ file: f, title: String(o.title ?? name ?? f.replace(/\.json$/, "")) });
        }
      }
      if (out.length) return out;
    }
  } catch {
    /* fall back to the build-time list */
  }
  return (typeof __EXAMPLES__ !== "undefined" ? __EXAMPLES__ : []).map((f) => ({ file: f, title: f.replace(/\.json$/, "") }));
}

async function loadExample(ex: ExampleEntry) {
  const url = /^(https?:)?\/\//.test(ex.file) || ex.file.startsWith("examples/") ? ex.file : `examples/${ex.file}`;
  try {
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    $<HTMLTextAreaElement>("src").value = text;
    load(text);
    if (current) current.source = `the example ${ex.file}`;
    $("psource").textContent = `Loaded from the example ${ex.file}.`;
  } catch (e) {
    showError(`Couldn't load the example ${ex.file}: ${(e as Error).message}`);
  }
}

async function initExamples() {
  const list = await listExamples();
  const box = $("examples");
  box.replaceChildren();
  if (!list.length) {
    box.append(el("span", { class: "muted small" }, "No examples published yet."));
    return;
  }
  box.append(el("span", { class: "muted small chips-label" }, "Examples:"));
  for (const ex of list) {
    const b = el("button", { type: "button", class: "chip", "data-file": ex.file }, ex.title);
    b.addEventListener("click", () => void loadExample(ex));
    box.append(b);
  }
}

// ---------- boot ----------

function fromHash() {
  const h = window.location.hash;
  if (/^#p=/.test(h) || /^#[A-Za-z0-9_-]{40,}$/.test(h)) {
    $<HTMLTextAreaElement>("src").value = window.location.href;
    load(h, { updateHash: false, fromHash: true });
  }
}
window.addEventListener("hashchange", fromHash);
void initExamples();
fromHash();
