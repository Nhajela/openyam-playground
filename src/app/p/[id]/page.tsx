import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Replay from "@/components/Replay";
import ValidationSummary from "@/components/ValidationSummary";
import BringToArm from "@/components/BringToArm";
import CopyButton from "@/components/CopyButton";
import { getStore } from "@/lib/store";
import { ID_RE, baseUrl } from "@/lib/ids";
import { checkPlayable } from "@/lib/arm/check";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!ID_RE.test(id)) return null;
  const row = await getStore().get(id);
  if (!row || row.status === "invalid") return null;
  return row;
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const row = await load(params.id);
  return row ? { title: `"${row.prompt.slice(0, 60)}" - OpenYAM Playground`, description: "A robot-arm motion written from English. Watch it in 3D." } : { title: "Not found - OpenYAM Playground" };
}

export default async function PlayablePage({ params }: { params: { id: string } }) {
  const row = await load(params.id);
  if (!row) notFound();
  const check = checkPlayable(row.playable);
  const url = `${baseUrl(headers())}/p/${row.id}`;
  const bad = check.validation.violations.map((v) => v.joint ?? "").filter(Boolean);
  return (
    <div className="grid">
      <section className="card">
        <p className="quote">&ldquo;{row.prompt}&rdquo;</p>
        {row.playable.notes ? <p className="notes">{row.playable.notes}</p> : null}
        <div style={{ marginTop: 12 }}>
          <Replay playable={row.playable} bad={bad} />
        </div>
        <div style={{ marginTop: 12 }}>
          <ValidationSummary ok={check.ok} validation={check.validation} geometry={check.geometry} />
        </div>
        <details style={{ marginTop: 8 }}>
          <summary>Motion JSON ({row.model})</summary>
          <pre className="json">{JSON.stringify(row.playable, null, 1)}</pre>
        </details>
      </section>
      <section className="card sticky">
        <div className="share" style={{ marginTop: 0 }}>
          <div className="qr"><img src={`/api/p/${row.id}/qr.png`} alt={`QR code for ${url}`} /></div>
          <div>
            <span className="badge neutral">code {row.id}</span>
            <div className="linkbox" style={{ marginTop: 10 }}><span>{url}</span><CopyButton text={url} label="Share" /></div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <BringToArm />
        </div>
      </section>
    </div>
  );
}
