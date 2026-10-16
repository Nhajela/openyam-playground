import QRCode from "qrcode";
import { getStore } from "@/lib/store";
import { ID_RE, baseUrl } from "@/lib/ids";
import { CORS, jsonError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const id = params.id.toLowerCase();
  if (!ID_RE.test(id)) return jsonError(404, "not found", {}, CORS);
  const row = await getStore().get(id);
  if (!row || row.status === "invalid") return jsonError(404, "not found", {}, CORS);
  const url = `${baseUrl(req.headers)}/p/${row.id}`;
  const png = await QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 2, width: 512, color: { dark: "#111111", light: "#ffffff" } });
  return new Response(new Uint8Array(png), { headers: { ...CORS, "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" } });
}
