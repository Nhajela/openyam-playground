import { NextResponse } from "next/server";
import { getProvider } from "@/lib/llm";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  let llm: string;
  try {
    const p = getProvider();
    llm = `${p.id}:${p.model}`;
  } catch (e) {
    llm = `unconfigured (${(e as Error).message})`;
  }
  return NextResponse.json({ ok: true, llm, store: getStore().kind });
}
