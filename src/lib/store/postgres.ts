import postgres from "postgres";
import type { PlayableRow, Status, Store } from "./types";
import { SCHEMA_SQL } from "./schema";

type Row = Omit<PlayableRow, "created_at"> & { created_at: Date | string };
const out = (r: Row): PlayableRow => ({ ...r, created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at) });

/** Postgres store (Neon, Coolify Postgres, ...). Applies the idempotent schema on first use. */
export function postgresStore(url: string): Store {
  const ssl = /sslmode=require|neon\.tech/.test(url) ? "require" : undefined;
  const sql = postgres(url, { max: Number(process.env.DATABASE_POOL_MAX ?? 5), idle_timeout: 20, connect_timeout: 10, ssl, onnotice: () => {} });
  let ready: Promise<void> | null = null;
  const init = () => (ready ??= sql.unsafe(SCHEMA_SQL).then(() => undefined).catch((e) => { ready = null; throw e; }));
  const cols = sql`id, created_at, prompt, playable, validation, model, ip_hash, status`;
  return {
    kind: "postgres",
    async insert(row) {
      await init();
      const [r] = await sql<Row[]>`
        INSERT INTO playables (id, prompt, playable, validation, model, ip_hash, status)
        VALUES (${row.id}, ${row.prompt}, ${sql.json(row.playable as never)}, ${sql.json(row.validation as never)}, ${row.model}, ${row.ip_hash}, ${row.status})
        RETURNING ${cols}`;
      return out(r);
    },
    async get(id) {
      await init();
      const [r] = await sql<Row[]>`SELECT ${cols} FROM playables WHERE id = ${id}`;
      return r ? out(r) : null;
    },
    async setStatus(id, status: Status) {
      await init();
      const [r] = await sql<Row[]>`UPDATE playables SET status = ${status} WHERE id = ${id} RETURNING ${cols}`;
      return r ? out(r) : null;
    },
    async listPublished(limit) {
      await init();
      const rs = await sql<Row[]>`SELECT ${cols} FROM playables WHERE status = 'published' ORDER BY created_at DESC LIMIT ${limit}`;
      return rs.map(out);
    },
    async countSince(ipHash, since) {
      await init();
      const [r] = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM playables WHERE ip_hash = ${ipHash} AND created_at >= ${since}`;
      return r.n;
    },
    async exists(id) {
      await init();
      const rs = await sql`SELECT 1 FROM playables WHERE id = ${id}`;
      return rs.length > 0;
    },
  };
}
