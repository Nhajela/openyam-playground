import type { GeometryReport } from "@/lib/arm/kinematics";
import type { ValidationResult } from "@/lib/arm/playable";

type Attempt = { round: string; ok?: boolean; error?: string; kinds?: string[] };

export default function ValidationSummary({ ok, validation, geometry, attempts, retimed }: { ok: boolean; validation: ValidationResult; geometry: GeometryReport | null; attempts?: Attempt[]; retimed?: boolean }) {
  const rounds = attempts?.filter((a) => a.round !== "retime").length ?? 0;
  const items = [
    ...validation.violations.slice(0, 8).map((v) => v.msg),
    ...(geometry?.violations ?? []).map((v) => v.msg),
  ];
  const peakVel = validation.max_vel ? Math.max(...validation.max_vel) : null;
  return (
    <div>
      <div className="row">
        {ok ? (
          <span className="badge ok">
            <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Inside the safe range
          </span>
        ) : (
          <span className="badge bad">Needs changes: {items.length} problem{items.length === 1 ? "" : "s"}</span>
        )}
        {retimed ? <span className="badge warn">slowed down to fit the speed caps</span> : null}
        {rounds > 1 ? <span className="badge neutral">fixed in {rounds} tries</span> : null}
      </div>
      <div className="stats">
        <div className="stat"><b>{validation.duration !== null ? `${validation.duration.toFixed(1)} s` : "-"}</b><span>duration</span></div>
        <div className="stat"><b>{peakVel !== null ? peakVel.toFixed(2) : "-"}</b><span>peak rad/s (cap 0.3)</span></div>
        <div className="stat"><b>{geometry ? `${Math.round(geometry.min_z * 100)} cm` : "-"}</b><span>lowest hand height</span></div>
      </div>
      {items.length ? (
        <ul className="violations">
          {items.map((m, i) => <li key={i}>{m}</li>)}
          {validation.violations.length > 8 ? <li>and {validation.violations.length - 8} more</li> : null}
        </ul>
      ) : null}
    </div>
  );
}
