import type { Playable } from "../arm/playable";

export type Status = "draft" | "published" | "invalid";

export interface PlayableRow {
  id: string;
  created_at: string;
  prompt: string;
  playable: Playable;
  /** {ok, validation, geometry, attempts, retimed, provider} */
  validation: Record<string, unknown>;
  model: string;
  ip_hash: string;
  status: Status;
}

export interface Store {
  kind: "postgres" | "memory";
  insert(row: Omit<PlayableRow, "created_at">): Promise<PlayableRow>;
  get(id: string): Promise<PlayableRow | null>;
  setStatus(id: string, status: Status): Promise<PlayableRow | null>;
  listPublished(limit: number): Promise<PlayableRow[]>;
  countSince(ipHash: string, since: Date): Promise<number>;
  exists(id: string): Promise<boolean>;
}
