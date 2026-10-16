import Link from "next/link";
import ArmGlyph from "@/components/ArmGlyph";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gallery - OpenYAM Playground" };

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export default async function Gallery() {
  let rows: Awaited<ReturnType<ReturnType<typeof getStore>["listPublished"]>> = [];
  let failed = false;
  try {
    rows = await getStore().listPublished(60);
  } catch (e) {
    console.error("gallery", e);
    failed = true;
  }
  return (
    <>
      <section className="hero">
        <h1>Recent <em>moves</em></h1>
        <p>Motions people saved, each checked against the arm&apos;s safe range. Tap one to watch it.</p>
      </section>
      {failed ? <div className="card empty">The gallery is taking a nap. Try again in a moment.</div> : null}
      {!failed && rows.length === 0 ? (
        <div className="card empty" style={{ margin: "16px 0" }}>
          Nothing here yet. <Link href="/">Make the first move</Link>.
        </div>
      ) : null}
      <div className="gallery">
        {rows.map((r) => {
          const v = r.validation as { validation?: { duration?: number } };
          return (
            <Link key={r.id} href={`/p/${r.id}`} className="tile">
              <ArmGlyph playable={r.playable} className="glyph" />
              <div style={{ minWidth: 0 }}>
                <p>{r.prompt}</p>
                <small>{v.validation?.duration ? `${v.validation.duration.toFixed(1)} s` : ""} · {ago(r.created_at)}</small>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
