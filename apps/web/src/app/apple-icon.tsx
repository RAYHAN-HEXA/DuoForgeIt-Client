import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Apple touch icon — the mascot mark on a soft indigo tile. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#eef2ff',
        }}
      >
        <svg width="120" height="114" viewBox="0 0 200 190">
          <rect x="48" y="34" width="104" height="130" rx="34" fill="#4f46e5" />
          <rect x="62" y="52" width="76" height="62" rx="14" fill="#f8fafc" />
          <circle cx="88" cy="80" r="10" fill="#0b1220" />
          <circle cx="112" cy="80" r="10" fill="#0b1220" />
          <circle cx="88" cy="80" r="4" fill="#f8fafc" />
          <circle cx="112" cy="80" r="4" fill="#f8fafc" />
          <path d="M86 98 Q100 108 114 98" fill="none" strokeWidth="6" strokeLinecap="round" stroke="#0b1220" />
          <line x1="100" y1="34" x2="100" y2="20" strokeWidth="6" strokeLinecap="round" stroke="#4f46e5" />
          <circle cx="100" cy="16" r="7" fill="#4f46e5" />
        </svg>
      </div>
    ),
    size,
  );
}
