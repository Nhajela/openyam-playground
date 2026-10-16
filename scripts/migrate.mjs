// Apply migrations/*.sql to DATABASE_URL (idempotent). The app also applies the schema on first use.
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const sql = postgres(url, { max: 1, ssl: /sslmode=require|neon\.tech/.test(url) ? "require" : undefined, onnotice: () => {} });
for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  await sql.unsafe(readFileSync(join(dir, f), "utf8"));
  console.log(`applied ${f}`);
}
await sql.end();
