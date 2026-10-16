import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // no 0/o, 1/l/i
export const ID_RE = /^[a-z0-9]{6,12}$/;

export function newId(len = 6): string {
  const bytes = randomBytes(len * 2);
  let s = "";
  for (let i = 0; s.length < len && i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 248) s += ALPHABET[b % ALPHABET.length]; // 248 = 8 * 31, unbiased
  }
  return s.length === len ? s : newId(len);
}

/** Salted SHA-256 of the client IP; the raw IP is never stored. */
export function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT || "openyam-playground";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/**
 * Client IP for rate limiting. Prefer X-Real-IP (set by Traefik/Coolify and Vercel), else the
 * LAST X-Forwarded-For entry (the one our proxy appended; earlier entries are client-controlled).
 */
export function clientIp(headers: Headers): string {
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",").map((s) => s.trim()).filter(Boolean).pop() || "unknown";
  return "unknown";
}

export function baseUrl(headers: Headers): string {
  const env = process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") || headers.get("host") || "localhost:3000";
  const proto = headers.get("x-forwarded-proto")?.split(",")[0] || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
