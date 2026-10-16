/** Sliding-window limiter per key (in-process). The generate route also counts DB rows when Postgres is configured. */
const hits = new Map<string, number[]>();

export function rateLimitPerHour(): number {
  const n = Number(process.env.RATE_LIMIT_PER_HOUR ?? 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
}

export function takeToken(key: string, limit = rateLimitPerHour(), windowMs = 3_600_000, now = Date.now()): { ok: boolean; remaining: number; retryAfterS: number } {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return { ok: false, remaining: 0, retryAfterS: Math.ceil((windowMs - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 50_000) for (const k of [...hits.keys()].slice(0, 10_000)) hits.delete(k);
  return { ok: true, remaining: limit - arr.length, retryAfterS: 0 };
}

export function resetRateLimits() {
  hits.clear();
}
