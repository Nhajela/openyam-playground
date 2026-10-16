"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    try {
      setTheme(localStorage.getItem("theme"));
    } catch {
      /* storage blocked */
    }
  }, []);
  const next = () => {
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = theme ?? (sysDark ? "dark" : "light");
    const t = cur === "dark" ? "light" : "dark";
    setTheme(t);
    document.documentElement.dataset.theme = t;
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* ignore */
    }
  };
  return (
    <button className="icon-btn" onClick={next} aria-label="Toggle light or dark theme" title="Light / dark">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" />
      </svg>
    </button>
  );
}
