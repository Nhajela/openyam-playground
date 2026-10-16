import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { ID_RE, baseUrl } from "@/lib/ids";
import { checkPlayable } from "@/lib/arm/check";
import { describeEnvelope } from "@/lib/arm/envelope";
import { CORS, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Read-only playable for the lab arm station (CORS open). The station must re-validate
 * with the lab's own armctl validator before a human presses Play; `check` here is advisory.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id.toLowerCase();
  if (!ID_RE.test(id)) return jsonError(404, "not found", {}, CORS);
  const row = await getStore().get(id);
  if (!row || row.status === "invalid") return jsonError(404, "not found", {}, CORS);
  const check = checkPlayable(row.playable);
  const base = baseUrl(req.headers);
  return NextResponse.json(
    {
      format: "openyam-playable/v1",
      id: row.id,
      url: `${base}/p/${row.id}`,
      status: row.status,
      created_at: row.created_at,
      prompt: row.prompt,
      model: row.model,
      playable: row.playable,
      check: { ok: check.ok, validation: check.validation, geometry: check.geometry, checked_at: new Date().toISOString() },
      envelope: describeEnvelope(),
    },
    { headers: { ...CORS, "Cache-Control": "public, max-age=60" } },
  );
}
