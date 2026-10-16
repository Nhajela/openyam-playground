"use client";

/**
 * 3D replay of a playable. The arm is procedural (capsules between the URDF joint origins,
 * computed with the same forward kinematics the server uses for the geometry check), not
 * the STL meshes: see README "License check". three.js only, no mesh downloads.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { forwardKinematics, TABLE_Z_MIN, type Mat4, type Vec3 } from "@/lib/arm/kinematics";
import { sample, type Playable } from "@/lib/arm/playable";
import { POSES } from "@/lib/arm/envelope";

type Props = {
  playable: Playable | null;
  autoPlay?: boolean;
  loop?: boolean;
  label?: React.ReactNode;
  badJoints?: string[];
};

type Palette = { links: number[]; joint: number; tip: number; trail: number; table: number; grid: number; plane: number; bad: number };
const LIGHT: Palette = { links: [0x2b2a33, 0xf2621f, 0x2b2a33, 0xf2621f, 0x2b2a33, 0x2b2a33], joint: 0x8a8696, tip: 0xf2621f, trail: 0x2f6fec, table: 0xe9e1d4, grid: 0xcfc6b8, plane: 0x2f6fec, bad: 0xc93636 };
const DARK: Palette = { links: [0xd9d6df, 0xff7d3d, 0xd9d6df, 0xff7d3d, 0xd9d6df, 0xd9d6df], joint: 0x6d6a7a, tip: 0xff7d3d, trail: 0x7aa5ff, table: 0x24222d, grid: 0x3a3747, plane: 0x7aa5ff, bad: 0xff7a7a };

function isDark(): boolean {
  if (typeof window === "undefined") return false;
  const forced = document.documentElement.dataset.theme;
  if (forced) return forced === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const toV = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
const toM = (m: Mat4) => new THREE.Matrix4().set(...(m as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number]));

export default function ArmViewer({ playable, autoPlay = true, loop = false, label, badJoints = [] }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ setPose: (q: number[], grip: number) => void; setTrail: (pts: Vec3[]) => void; setTheme: (dark: boolean) => void; setBad: (b: string[]) => void } | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const tRef = useRef(0);
  const playingRef = useRef(autoPlay);

  const samples = useMemo(() => {
    if (!playable) return null;
    try {
      return sample(playable);
    } catch {
      return null;
    }
  }, [playable]);
  const D = samples?.duration ?? 0;

  // build scene once
  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(38, 1, 0.01, 20);
    cam.position.set(0.78, 0.62, 0.92);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.target.set(0.08, 0.28, 0);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 0.4;
    controls.maxDistance = 2.5;
    controls.maxPolarAngle = Math.PI * 0.49;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(1.2, 2.2, 1.4);
    scene.add(sun);

    const world = new THREE.Group();
    world.rotation.x = -Math.PI / 2; // URDF z-up -> three y-up
    scene.add(world);

    const mats = { links: [] as THREE.MeshStandardMaterial[], joint: new THREE.MeshStandardMaterial({ roughness: 0.5 }), tip: new THREE.MeshStandardMaterial({ roughness: 0.3, emissiveIntensity: 0.4 }) };
    const table = new THREE.Mesh(new THREE.CircleGeometry(0.55, 64), new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.9 }));
    world.add(table);
    const grid = new THREE.PolarGridHelper(0.55, 8, 5, 64);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.001;
    world.add(grid);
    const plane = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.5, 64), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
    plane.position.z = TABLE_Z_MIN;
    world.add(plane);
    // forward arrow on the table
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.08, 0, 0.002), 0.18, 0x999999, 0.04, 0.025);
    world.add(arrow);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.068, 40), mats.joint);
    base.rotation.x = Math.PI / 2;
    base.position.z = 0.034;
    world.add(base);

    const R = [0.03, 0.026, 0.024, 0.02, 0.018, 0.018];
    const bones: THREE.Mesh[] = [];
    const balls: THREE.Mesh[] = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.05 });
      mats.links.push(m);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 24), m);
      world.add(b);
      bones.push(b);
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mats.joint);
      world.add(s);
      balls.push(s);
    }
    const gripper = new THREE.Group();
    gripper.matrixAutoUpdate = false;
    world.add(gripper);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.075, 0.04), mats.links[5]);
    palm.position.z = -0.035;
    gripper.add(palm);
    const fingerGeo = new THREE.BoxGeometry(0.014, 0.01, 0.055);
    const fl = new THREE.Mesh(fingerGeo, mats.tip);
    const fr = new THREE.Mesh(fingerGeo, mats.tip);
    gripper.add(fl, fr);
    const tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 16, 12), mats.tip);
    world.add(tipDot);

    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 });
    const trail = new THREE.Line(trailGeo, trailMat);
    trail.frustumCulled = false; // geometry changes per playable
    world.add(trail);

    const up = new THREE.Vector3(0, 1, 0);
    function placeBone(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, r: number) {
      const d = new THREE.Vector3().subVectors(b, a);
      const len = Math.max(d.length(), 1e-4);
      mesh.position.copy(a).addScaledVector(d, 0.5);
      mesh.scale.set(r, len, r);
      mesh.quaternion.setFromUnitVectors(up, d.normalize());
    }
    let bad = new Set<string>();
    let pal = isDark() ? DARK : LIGHT;
    function applyTheme(dark: boolean) {
      pal = dark ? DARK : LIGHT;
      mats.links.forEach((m, i) => m.color.setHex(pal.links[Math.min(i, 5)]));
      mats.joint.color.setHex(pal.joint);
      mats.tip.color.setHex(pal.tip);
      mats.tip.emissive.setHex(pal.tip);
      (table.material as THREE.MeshStandardMaterial).color.setHex(pal.table);
      (plane.material as THREE.MeshBasicMaterial).color.setHex(pal.plane);
      trailMat.color.setHex(pal.trail);
      (grid.material as THREE.LineBasicMaterial).color?.setHex(pal.grid);
      applyBad();
    }
    function applyBad() {
      mats.links.forEach((m, i) => m.color.setHex(bad.has(`j${i + 1}`) ? pal.bad : pal.links[Math.min(i, 5)]));
    }
    function setPose(q: number[], grip: number) {
      const fk = forwardKinematics(q);
      const pts = [new THREE.Vector3(0, 0, 0.068), ...fk.jointOrigins.slice(1).map(toV)];
      // pts: j1..j6 origins (j1 at the top of the base)
      for (let i = 0; i < 7; i++) {
        bones[i].visible = i < pts.length - 1;
        balls[i].visible = i < pts.length;
        if (i < pts.length - 1) placeBone(bones[i], pts[i], pts[i + 1], R[Math.min(i, 5)]);
        if (i < pts.length) {
          balls[i].position.copy(pts[i]);
          const r = R[Math.min(i, 5)] * 1.15;
          balls[i].scale.set(r, r, r);
        }
      }
      gripper.matrix.copy(toM(fk.gripper));
      gripper.matrixWorldNeedsUpdate = true;
      const open = 0.008 + 0.022 * Math.max(0, Math.min(1, grip));
      fl.position.set(0, open, -0.08);
      fr.position.set(0, -open, -0.08);
      tipDot.position.copy(toV(fk.tip));
    }
    function setTrail(p: Vec3[]) {
      trailGeo.setFromPoints(p.map(toV));
      trailGeo.computeBoundingSphere();
    }

    applyTheme(isDark());
    setPose(POSES.ready, 0);
    api.current = { setPose, setTrail, setTheme: applyTheme, setBad: (b) => { bad = new Set(b); applyBad(); } };

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, false);
      cam.aspect = w / Math.max(h, 1);
      cam.updateProjectionMatrix();
    });
    ro.observe(el);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => applyTheme(isDark());
    mq.addEventListener("change", onScheme);
    const mo = new MutationObserver(onScheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, cam);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      mq.removeEventListener("change", onScheme);
      controls.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      api.current = null;
    };
  }, []);

  // pose at time t
  const poseAt = (time: number) => {
    if (!samples || !api.current) return;
    const n = samples.t.length;
    const f = Math.min(Math.max(time * samples.rate, 0), n - 1);
    const i = Math.floor(f), k = Math.min(i + 1, n - 1), a = f - i;
    const q = samples.q[i].map((v, j) => v + (samples.q[k][j] - v) * a);
    const g = samples.grip[i] + (samples.grip[k] - samples.grip[i]) * a;
    api.current.setPose(q, g);
  };

  // new playable: reset, trail
  useEffect(() => {
    if (!api.current) return;
    if (!samples) {
      api.current.setPose(POSES.ready, 0);
      api.current.setTrail([]);
      return;
    }
    const pts: Vec3[] = [];
    for (let i = 0; i < samples.q.length; i += 4) pts.push(forwardKinematics(samples.q[i]).tip);
    api.current.setTrail(pts);
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
