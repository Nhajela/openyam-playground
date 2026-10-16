import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "OpenYAM Playground",
  description: "Type what a robot arm should do. Watch it in 3D, then bring the QR code to the real OpenYAM arm.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f1" },
    { media: "(prefers-color-scheme: dark)", color: "#14131a" },
  ],
};

const THEME_INIT = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <div className="wrap">
          <header className="top">
            <Link href="/" className="brand">
              <Logo />
              <span>OpenYAM Playground<small>English in, robot moves out</small></span>
            </Link>
            <nav className="nav">
              <Link href="/">Make</Link>
              <Link href="/gallery">Gallery</Link>
              <ThemeToggle />
            </nav>
          </header>
          <main>{children}</main>
          <footer className="foot">
            OpenYAM Playground. A language model writes a joint-space motion, it is checked against the arm&apos;s limits, speed caps and
            workspace here, and again at the lab before a person presses Play. <a href="/api/health">status</a>
          </footer>
        </div>
      </body>
    </html>
  );
}
