import { checkGeometry, type GeometryReport } from "./kinematics";
import { sample, validate, type Playable, type ValidationResult } from "./playable";

export interface CheckResult {
  ok: boolean;
  validation: ValidationResult;
  geometry: GeometryReport | null;
}

/** Joint-space validation (port of the lab validator) plus the FK workspace check. */
export function checkPlayable(p: Playable): CheckResult {
  const validation = validate(p);
  let geometry: GeometryReport | null = null;
  if (validation.duration !== null) {
    try {
      geometry = checkGeometry(sample(p), p.keyframes);
    } catch {
      geometry = null;
    }
  }
  return { ok: validation.ok && (geometry?.ok ?? false), validation, geometry };
}
