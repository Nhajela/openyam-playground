/**
 * The playable interchange format marker and version gate (spec v1), same rules and messages
 * as armctl/playable.py compat():
 *   "format": "openyam-playable", "version": "1.0"
 * - any 1.x is accepted (minor versions only add optional fields; unknown fields are ignored);
 * - any other major, a malformed version, or a different format is refused;
 * - a playable with neither field is legacy and read as 1.0.
 */
export const FORMAT_ID = "openyam-playable";
export const FORMAT_VERSION = "1.0";
export const SUPPORTED_MAJOR = 1;

export interface FormatVerdict {
  /** ok: declared 1.x; legacy: no format/version fields; refused: anything else. */
  status: "ok" | "legacy" | "refused";
  version: string | null;
  format: string | null;
  msg: string;
}

function pyRepr(x: unknown): string {
  if (x === undefined || x === null) return "None";
  if (typeof x === "string") return `'${x}'`;
  if (typeof x === "boolean") return x ? "True" : "False";
  return JSON.stringify(x);
}

export function checkFormat(playable: unknown): FormatVerdict {
  if (!playable || typeof playable !== "object" || Array.isArray(playable)) {
    return { status: "refused", version: null, format: null, msg: "playable must be a JSON object" };
  }
  const p = playable as Record<string, unknown>;
  const fmt = p.format ?? null, ver = p.version ?? null;
  const format = fmt === null ? null : String(fmt);
  const version = ver === null ? null : String(ver);
  if (fmt === null && ver === null) {
    return { status: "legacy", version, format, msg: "legacy (no format/version), treated as 1.0" };
  }
  if (fmt !== FORMAT_ID) {
    return { status: "refused", version, format, msg: `format ${pyRepr(fmt)} is not '${FORMAT_ID}'` };
  }
  if (typeof ver !== "string" || !/^\d+\.\d+$/.test(ver)) {
    return { status: "refused", version, format, msg: `version ${pyRepr(ver)} must be a 'MAJOR.MINOR' string, e.g. '1.0'` };
  }
  if (Number(ver.split(".")[0]) !== SUPPORTED_MAJOR) {
    return { status: "refused", version, format, msg: `version ${ver} not supported: this lab reads ${SUPPORTED_MAJOR}.x` };
  }
  return { status: "ok", version, format, msg: `${FORMAT_ID} ${ver}` };
}
