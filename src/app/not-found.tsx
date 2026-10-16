import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card empty" style={{ margin: "24px 0" }}>
      <p className="quote">That move isn&apos;t here.</p>
      <p>Check the code, or <Link href="/">make a new one</Link>.</p>
    </div>
  );
}
