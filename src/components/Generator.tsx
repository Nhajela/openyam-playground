"use client";

import { useMemo, useState } from "react";
import ArmViewer from "./ArmViewer";
import ValidationSummary from "./ValidationSummary";
import SafetyNote from "./SafetyNote";
import CopyButton from "./CopyButton";
import QrCode from "./QrCode";
import type { Playable, ValidationResult } from "@/lib/arm/playable";
import type { GeometryReport } from "@/lib/arm/kinematics";
import { VICTORY, toPlayable } from "@/lib/arm/samples";

const MAX = 300;
const EXAMPLES = ["do a little victory dance", "wave hello to the crowd", "take a graceful bow", "nod yes three times", "look around curiously", "shy wave, then hide"];
const THINKING = ["Choreographing", "Checking joint limits", "Counting radians", "Warming up the elbow"];

type Gen = {
  ok: boolean;
  id: string | null;
  prompt: string;
  playable: Playable;
  validation: ValidationResult;
  geometry: GeometryReport | null;
  attempts: { round: string; ok?: boolean; kinds?: string[] }[];
  retimed: boolean;
  model: string;
  local: string | null;
  store_error?: string;
};
type Saved = { id: string; url: string; qr: string };

export default function Generator() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [gen, setGen] = useState<Gen | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const demo = useMemo(() => toPlayable(VICTORY), []);

  async function generate(text?: string) {
    const p = (text ?? prompt).trim();
    if (!p || busy) return;
    if (text) setPrompt(text);
    setBusy(true);
    setErr(null);
    setSaved(null);
    const timer = setInterval(() => setMsg((m) => (m + 1) % THINKING.length), 1400);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p }) });
      const data = await res.json().catch(() => ({ error: "Unexpected response from the server." }));
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setGen(data);
      requestAnimationFrame(() => document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  async function save() {
    if (!gen?.id) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(`/api/p/${gen.id}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setSaved(data);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const localUrl = gen?.local && typeof window !== "undefined" ? `${window.location.origin}/p/local#${gen.local}` : null;
  const over = prompt.length > MAX;

  return (
    <div className="grid">
      <section className="card sticky" aria-labelledby="make">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
        >
          <label id="make" className="prompt-label" htmlFor="prompt">What should the arm do?</label>
          <textarea
            id="prompt"
            className="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                generate();
              }
            }}
            placeholder="do a little victory dance"
            maxLength={MAX + 50}
            rows={3}
          />
          <div className="row between">
            <span className={`counter ${over ? "over" : ""}`}>{prompt.length}/{MAX}</span>
            <span className="counter">Plain English, any language</span>
          </div>
          <div className="chips" aria-label="Examples">
            {EXAMPLES.map((ex) => (
              <button type="button" key={ex} className="chip" onClick={() => generate(ex)} disabled={busy}>{ex}</button>
            ))}
          </div>
          <button className="btn btn-primary btn-big" type="submit" disabled={busy || !prompt.trim() || over}>
            {busy ? "Generating..." : "Generate"}
          </button>
        </form>
        {busy ? (
          <div className="thinking" role="status"><span className="dots"><span /><span /><span /></span>{THINKING[msg]}...</div>
        ) : null}
        {err ? <div className="error" role="alert">{err}</div> : null}
        <SafetyNote />
      </section>

      <section id="result" className="card" aria-live="polite">
        {gen ? (
          <>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}>
                <p className="quote">&ldquo;{gen.prompt}&rdquo;</p>
                {gen.playable.notes ? <p className="notes">{gen.playable.notes}</p> : null}
              </div>
            </div>
            <ArmViewer playable={gen.playable} badJoints={gen.validation.violations.map((v) => v.joint ?? "").filter(Boolean)} />
            <div style={{ marginTop: 12 }}>
              <ValidationSummary ok={gen.ok} validation={gen.validation} geometry={gen.geometry} attempts={gen.attempts} retimed={gen.retimed} />
            </div>
            {gen.ok ? (
              saved ? (
                <div className="share">
                  <div className="qr"><img src={saved.qr} alt={`QR code for ${saved.url}`} /></div>
                  <div>
                    <h2 style={{ margin: "0 0 6px" }}>Saved. Bring this to the arm.</h2>
                    <p style={{ margin: "0 0 10px", color: "var(--muted)" }}>Show the QR to the operator at the lab, or open the link on your phone.</p>
                    <div className="linkbox"><span>{saved.url}</span><CopyButton text={saved.url} label="Share" /></div>
                    <p style={{ margin: "10px 0 0" }}><a href={`/p/${saved.id}`}>Open its page</a></p>
                  </div>
                </div>
              ) : (
                <div className="row" style={{ marginTop: 14 }}>
                  {gen.id ? (
                    <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save & get QR"}</button>
                  ) : null}
                  <button className="btn btn-ghost" onClick={() => generate(gen.prompt)} disabled={busy}>Try another take</button>
                </div>
              )
            ) : (
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={() => generate(gen.prompt)} disabled={busy}>Try again</button>
              </div>
            )}
            {gen.ok && localUrl ? (
              <details style={{ marginTop: 14 }}>
                <summary>No internet at the arm? Offline QR</summary>
                <p style={{ fontSize: 14, color: "var(--muted)" }}>This QR holds the whole motion inside the link itself, so it works even without our server.</p>
                <div className="share">
                  <QrCode text={localUrl} label="Offline QR code with the motion inside the link" />
                  <div className="linkbox"><span>{localUrl}</span><CopyButton text={localUrl} /></div>
                </div>
              </details>
            ) : null}
            {gen.store_error ? <p className="note">{gen.store_error}</p> : null}
            <details style={{ marginTop: 12 }}>
              <summary>Motion JSON ({gen.playable.keyframes.length} keyframes, {gen.model})</summary>
              <pre className="json">{JSON.stringify(gen.playable, null, 1)}</pre>
            </details>
          </>
        ) : (
          <>
            <div className="row between" style={{ marginBottom: 10 }}>
              <div>
                <p className="quote">Warming up</p>
                <p className="notes">This is the OpenYAM arm doing a victory dance. Type something and it will learn a new move.</p>
              </div>
            </div>
            <ArmViewer playable={demo} loop />
          </>
        )}
      </section>
    </div>
  );
}
