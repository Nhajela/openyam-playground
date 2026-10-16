"use client";

import { useEffect, useMemo, useState } from "react";
import ArmViewer from "./ArmViewer";
import ValidationSummary from "./ValidationSummary";
import BringToArm from "./BringToArm";
import QrCode from "./QrCode";
import CopyButton from "./CopyButton";
import { decodeLocal, type LocalShare } from "@/lib/codec";
import { checkPlayable } from "@/lib/arm/check";

/** /p/local#<data>: the motion lives entirely in the URL fragment (never sent to the server). */
export default function LocalPlayable() {
  const [share, setShare] = useState<LocalShare | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const read = () => {
      setUrl(window.location.href);
      try {
        setShare(decodeLocal(window.location.hash));
        setErr(null);
      } catch (e) {
        setShare(null);
        setErr((e as Error).message);
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const check = useMemo(() => (share ? checkPlayable(share.playable) : null), [share]);

  if (err) return <div className="card empty" style={{ margin: "24px 0" }}>This link doesn&apos;t contain a motion we can read ({err}).</div>;
  if (!share || !check) return <div className="card empty" style={{ margin: "24px 0" }}>Loading...</div>;
  return (
    <div className="grid">
      <section className="card">
        <p className="quote">&ldquo;{share.prompt || share.playable.name}&rdquo;</p>
        {share.playable.notes ? <p className="notes">{share.playable.notes}</p> : null}
        <div style={{ marginTop: 12 }}>
          <ArmViewer playable={share.playable} badJoints={check.validation.violations.map((v) => v.joint ?? "").filter(Boolean)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <ValidationSummary ok={check.ok} validation={check.validation} geometry={check.geometry} />
        </div>
      </section>
      <section className="card sticky">
        <div className="share" style={{ marginTop: 0 }}>
          <QrCode text={url} label="QR code with this motion inside the link" />
          <div>
            <span className="badge neutral">offline link: the motion is inside the URL</span>
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
