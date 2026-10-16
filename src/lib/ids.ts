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

export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "unknown";
}

export function baseUrl(headers: Headers): string {
  const env = process.env.PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = headers.get("x-forwarded-host") || headers.get("host") || "localhost:3000";
  const proto = headers.get("x-forwarded-proto")?.split(",")[0] || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
