/**
 * Offline share format: /p/local#<base64url(zlib-deflate(JSON))>, JSON = {"v":1,"prompt":..,"playable":{..}}.
 * zlib (RFC 1950) so the lab station can decode with Python's
 *   json.loads(zlib.decompress(base64.urlsafe_b64decode(frag + "=" * (-len(frag) % 4))))
 */
import { strFromU8, strToU8, unzlibSync, zlibSync } from "fflate";
import type { Playable } from "./arm/playable";

export interface LocalShare {
  v: 1;
  prompt?: string;
  playable: Playable;
}

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Keep only what the arm needs (motion + name/notes/prompt, plus the format/version marker and
 * the caps preset when present, since they change how it is validated) to keep the QR small.
 */
export function compactPlayable(p: Playable): Playable {
  const { name, notes, space, start, keyframes, loop, speed, format, version, caps } = p;
  return {
    ...(format !== undefined ? { format } : {}),
    ...(version !== undefined ? { version } : {}),
    name, ...(notes ? { notes } : {}), space, start, keyframes, loop, speed,
    ...(caps !== undefined ? { caps } : {}),
  };
}

export function encodeLocal(share: LocalShare): string {
  const json = JSON.stringify({ v: 1, ...(share.prompt ? { prompt: share.prompt } : {}), playable: compactPlayable(share.playable) });
  return toB64Url(zlibSync(strToU8(json), { level: 9 }));
}

export function decodeLocal(fragment: string): LocalShare {
  const s = fragment.replace(/^#/, "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length > 20000) throw new Error("not a playable link");
  const data = JSON.parse(strFromU8(unzlibSync(fromB64Url(s))));
  if (!data || typeof data !== "object" || data.v !== 1 || typeof data.playable !== "object") throw new Error("unknown playable link format");
  return data as LocalShare;
}
