"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Client-side QR (used for offline /p/local# links, which never touch the server). */
export default function QrCode({ text, label }: { text: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(text, { errorCorrectionLevel: "L", margin: 1, width: 640, color: { dark: "#111111", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [text]);
  return <div className="qr">{src ? <img src={src} alt={label} /> : null}</div>;
}
