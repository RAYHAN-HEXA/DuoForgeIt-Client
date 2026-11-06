import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/** Favicon — the mascot mark (same geometry as components/mascot.tsx). */
export default function Icon() {
  return new ImageResponse(
    (
      <svg width="32" height="32" viewBox="0 0 200 190">
        <rect x="48" y="34" width="104" height="130" rx="34" fill="#1e1e1e" />
        <rect x="62" y="52" width="76" height="62" rx="14" fill="#ffffff" />
        <circle cx="88" cy="80" r="10" fill="#1e1e1e" />
        <circle cx="112" cy="80" r="10" fill="#1e1e1e" />
        <circle cx="88" cy="80" r="4" fill="#ffffff" />
        <circle cx="112" cy="80" r="4" fill="#ffffff" />
        <path d="M86 98 Q100 108 114 98" fill="none" strokeWidth="6" strokeLinecap="round" stroke="#1e1e1e" />
        <line x1="100" y1="34" x2="100" y2="20" strokeWidth="6" strokeLinecap="round" stroke="#1e1e1e" />
        <circle cx="100" cy="16" r="7" fill="#1e1e1e" />
      </svg>
    ),
    size,
  );
}
