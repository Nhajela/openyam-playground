/** Same SQL as migrations/001_init.sql (a test keeps them in sync). Embedded so the standalone build needs no extra files. */
export const SCHEMA_SQL = `-- OpenYAM Playground schema. Idempotent; also applied automatically on first use.
CREATE TABLE IF NOT EXISTS playables (
  id          text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  prompt      text NOT NULL,
  playable    jsonb NOT NULL,
  validation  jsonb NOT NULL,
  model       text NOT NULL,
  ip_hash     text NOT NULL,
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'invalid'))
);
CREATE INDEX IF NOT EXISTS playables_status_created_idx ON playables (status, created_at DESC);
CREATE INDEX IF NOT EXISTS playables_ip_created_idx ON playables (ip_hash, created_at DESC);
`;
