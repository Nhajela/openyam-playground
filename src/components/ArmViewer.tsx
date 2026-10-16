"use client";

/**
 * 3D replay of a playable. The arm is procedural (capsules between the URDF joint origins,
 * computed with the same forward kinematics the server uses for the geometry check), not
 * the STL meshes: see README "License check". three.js only, no mesh downloads.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { sample, withCaps, type Playable } from "@/lib/arm/playable";
import { POSES } from "@/lib/arm/envelope";
import { createArmScene, poseAt as poseAtSamples, tipTrail, type ArmScene } from "@/lib/arm/scene";

type Props = {
  playable: Playable | null;
  autoPlay?: boolean;
  loop?: boolean;
  label?: React.ReactNode;
  badJoints?: string[];
};

export default function ArmViewer({ playable, autoPlay = true, loop = false, label, badJoints = [] }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ArmScene | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const tRef = useRef(0);
  const playingRef = useRef(autoPlay);

  const samples = useMemo(() => {
    if (!playable) return null;
    try {
      return withCaps(playable, () => sample(playable));
    } catch {
      return null;
    }
  }, [playable]);
  const D = samples?.duration ?? 0;

  // build scene once
  useEffect(() => {
    const scene = createArmScene(host.current!);
    api.current = scene;
    return () => {
      scene.dispose();
      api.current = null;
    };
  }, []);

  // pose at time t
  const poseAt = (time: number) => {
    if (!samples || !api.current) return;
    const p = poseAtSamples(samples, time);
    api.current.setPose(p.q, p.grip);
  };

  // new playable: reset, trail
  useEffect(() => {
    if (!api.current) return;
    if (!samples) {
      api.current.setPose(POSES.ready, 0);
      api.current.setTrail([]);
      return;
    }
    api.current.setTrail(tipTrail(samples.q));
    tRef.current = 0;
    setT(0);
    playingRef.current = autoPlay;
    setPlaying(autoPlay);
    poseAt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples]);

  useEffect(() => {
    api.current?.setBad(badJoints);
  }, [badJoints]);

  // playback clock
  useEffect(() => {
    let raf = 0;
    let last: number | null = null;
    let lastUi = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (playingRef.current && samples) {
        if (last !== null) tRef.current += (now - last) / 1000;
        if (tRef.current >= D) {
          if (loop) tRef.current = 0;
          else {
            tRef.current = D;
            playingRef.current = false;
            setPlaying(false);
          }
        }
        poseAt(tRef.current);
        if (now - lastUi > 66) {
          setT(tRef.current);
          lastUi = now;
        }
      }
      last = now;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, D, loop]);

  const toggle = () => {
    if (!samples) return;
    if (!playingRef.current && tRef.current >= D - 1e-3) tRef.current = 0;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  };
  const scrub = (v: number) => {
    tRef.current = (v / 1000) * D;
    setT(tRef.current);
    poseAt(tRef.current);
  };

  return (
    <div>
      <div className="viewer" ref={host} aria-label="3D preview of the robot arm" role="img">
        {label ? <div className="badge-wrap" style={{ position: "absolute", left: 12, top: 12 }}>{label}</div> : null}
        <div className="hint">drag to orbit</div>
      </div>
      <div className="controls">
        <button className="play" onClick={toggle} disabled={!samples} aria-label={playing ? "Pause" : "Play"}>
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="4.5" height="14" rx="1.5" fill="currentColor" /><rect x="11.5" y="3" width="4.5" height="14" rx="1.5" fill="currentColor" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L7.5 2.64A1 1 0 0 0 6 3.5z" fill="currentColor" /></svg>
          )}
        </button>
        <input className="scrub" type="range" min={0} max={1000} step={1} value={D ? Math.round((t / D) * 1000) : 0} onChange={(e) => scrub(Number(e.target.value))} disabled={!samples} aria-label="Scrub through the motion" />
        <span className="time">{t.toFixed(1)} / {D.toFixed(1)} s</span>
      </div>
    </div>
  );
}
