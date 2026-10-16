import type { PlayableRow, Status, Store } from "./types";

/** In-memory store for local development (DATABASE_URL unset). Lost on restart; per process. */
export function memoryStore(max = 5000): Store {
  const rows = new Map<string, PlayableRow>();
  return {
    kind: "memory",
    async insert(row) {
      const full: PlayableRow = { ...row, created_at: new Date().toISOString() };
      rows.set(row.id, full);
      if (rows.size > max) rows.delete(rows.keys().next().value as string);
      return full;
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async setStatus(id, status: Status) {
      const r = rows.get(id);
      if (!r) return null;
      r.status = status;
      return r;
    },
    async listPublished(limit) {
      return [...rows.values()].filter((r) => r.status === "published").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    },
    async countSince(ipHash, since) {
      const s = since.toISOString();
      return [...rows.values()].filter((r) => r.ip_hash === ipHash && r.created_at >= s).length;
    },
    async exists(id) {
      return rows.has(id);
    },
  };
}
