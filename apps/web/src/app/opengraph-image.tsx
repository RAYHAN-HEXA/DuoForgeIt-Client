import { ImageResponse } from 'next/og';

export const alt = 'TechService Hub — Your Ideas. Our Expertise. One Digital Solution.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** 1200×630 social card, statically generated at build from brand colors. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '72px 96px',
          background: 'linear-gradient(135deg, #0b1220 0%, #101a33 55%, #1d2b5e 100%)',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {/* Mascot mark — same geometry as components/mascot.tsx */}
          <svg width="110" height="105" viewBox="0 0 200 190">
            <rect x="48" y="34" width="104" height="130" rx="34" fill="#6366f1" />
            <rect x="62" y="52" width="76" height="62" rx="14" fill="#f8fafc" />
            <circle cx="88" cy="80" r="10" fill="#0b1220" />
            <circle cx="112" cy="80" r="10" fill="#0b1220" />
            <circle cx="88" cy="80" r="4" fill="#f8fafc" />
            <circle cx="112" cy="80" r="4" fill="#f8fafc" />
            <path d="M86 98 Q100 108 114 98" fill="none" strokeWidth="6" strokeLinecap="round" stroke="#0b1220" />
            <line x1="100" y1="34" x2="100" y2="20" strokeWidth="6" strokeLinecap="round" stroke="#6366f1" />
            <circle cx="100" cy="16" r="7" fill="#6366f1" />
          </svg>
          <div style={{ fontSize: 64, fontWeight: 700, letterSpacing: '-0.02em' }}>TechService Hub</div>
        </div>
        <div style={{ marginTop: 48, fontSize: 44, lineHeight: 1.25, maxWidth: 900 }}>
          Your ideas. Our expertise. One digital solution.
        </div>
        <div style={{ marginTop: 28, fontSize: 28, color: '#a5b4fc' }}>
          Web development · Software · Presentations · Documentation · IT consulting
        </div>
      </div>
    ),
    size,
  );
}
