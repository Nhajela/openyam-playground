export default function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="10" fill="var(--accent)" />
      <path d="M9 27h12" stroke="var(--accent-ink)" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 26V19l7-8 4 3" fill="none" stroke="var(--accent-ink)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15" cy="19" r="2.2" fill="var(--accent-ink)" />
      <circle cx="22" cy="11" r="2.2" fill="var(--accent-ink)" />
    </svg>
  );
}
