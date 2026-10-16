import { memoryStore } from "./memory";
import { postgresStore } from "./postgres";
import type { Store } from "./types";

const g = globalThis as unknown as { __openyamStore?: Store };

/** Postgres when DATABASE_URL is set, else an in-memory store (local dev only). */
export function getStore(): Store {
  if (!g.__openyamStore) {
    const url = process.env.DATABASE_URL;
    g.__openyamStore = url ? postgresStore(url) : memoryStore();
  }
  return g.__openyamStore;
}

export type { PlayableRow, Status, Store } from "./types";
