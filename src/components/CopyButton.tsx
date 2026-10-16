"use client";
import { useState } from "react";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-ghost"
      style={{ padding: "8px 12px", fontSize: 14 }}
      onClick={async () => {
        try {
          if (navigator.share && /Mobi/i.test(navigator.userAgent)) await navigator.share({ url: text });
          else await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* user cancelled */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
