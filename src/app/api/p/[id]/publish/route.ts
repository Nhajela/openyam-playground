import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ID_RE, baseUrl } from "@/lib/ids";
import { jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

/** "Save & get QR": publish a draft so it shows in the gallery and its QR works. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params.id.toLowerCase();
  if (!ID_RE.test(id)) return jsonError(404, "not found");
  const store = getStore();
  const row = await store.get(id);
  if (!row || row.status === "invalid" || (row.validation as { ok?: boolean }).ok !== true) return jsonError(404, "not found");
  if (row.status === "draft") await store.setStatus(id, "published");
  const base = baseUrl(req.headers);
  return NextResponse.json({ ok: true, id, url: `${base}/p/${id}`, qr: `${base}/api/p/${id}/qr.png`, api: `${base}/api/p/${id}` });
}
