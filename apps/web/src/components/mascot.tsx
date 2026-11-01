'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * TSH mascot ("Byte") — pure SVG, no Lottie payload.
 * Behaviors (PRD §5):
 *  - eyes follow the cursor while an email/name field is focused
 *  - hands cover the eyes while a password field is focused
 *  - shake on authentication failure
 *  - celebrate on successful registration
 * Provide `aria-hidden` — it's decorative; a visually-hidden live region
 * announces auth errors instead.
 */

export type MascotMood = 'idle' | 'watching' | 'covering' | 'shaking' | 'celebrating';

export function Mascot({ mood = 'idle', className }: { mood?: MascotMood; className?: string }) {
  const reduceMotion = useReducedMotion();
  const [tracked, setTracked] = useState({ x: 0, y: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const pupil = mood === 'watching' && !reduceMotion ? tracked : { x: 0, y: 0 };

  // Eye tracking: pupils drift toward the cursor while watching.
  // When not watching, render zeroes below — never setState synchronously here.
  useEffect(() => {
    if (mood !== 'watching' || reduceMotion) return;
    const onMove = (e: MouseEvent) => {
      const box = rootRef.current?.getBoundingClientRect();
      if (!box) return;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height * 0.42;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const angle = Math.atan2(dy, dx);
      const dist = Math.min(4.5, Math.hypot(dx, dy) / 40);
      setTracked({ x: Math.cos(angle) * dist, y: Math.sin(angle) * dist });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [mood, reduceMotion]);

  return (
    <motion.div
      ref={rootRef}
      className={className}
      aria-hidden="true"
      animate={
        mood === 'shaking' && !reduceMotion
          ? { x: [0, -10, 10, -7, 7, -3, 0], transition: { duration: 0.5 } }
          : mood === 'celebrating' && !reduceMotion
            ? { y: [0, -14, 0, -8, 0], transition: { duration: 0.9, times: [0, 0.3, 0.55, 0.75, 1] } }
            : { x: 0, y: 0 }
      }
    >
      <motion.svg
        viewBox="0 0 200 190"
        className="h-full w-full drop-shadow-md"
        initial={false}
        animate={{ rotate: mood === 'celebrating' && !reduceMotion ? [-4, 4, -4, 0] : 0 }}
        transition={{ duration: 0.9 }}
      >
        {/* body */}
        <ellipse cx="100" cy="176" rx="52" ry="8" className="fill-foreground/10" />
        <rect x="48" y="34" width="104" height="130" rx="34" className="fill-primary" />
        {/* screen face */}
        <rect x="62" y="52" width="76" height="62" rx="14" className="fill-background" />
        {/* eyes */}
        {mood !== 'covering' ? (
          <g>
            <circle cx="88" cy="80" r="10" className="fill-foreground" />
            <circle cx="112" cy="80" r="10" className="fill-foreground" />
            <motion.circle
              className="fill-background"
              cx={88 + pupil.x}
              cy={80 + pupil.y}
              r="4"
              animate={{ cx: 88 + pupil.x, cy: 80 + pupil.y }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            />
            <motion.circle
              className="fill-background"
              cx={112 + pupil.x}
              cy={80 + pupil.y}
              r="4"
              animate={{ cx: 112 + pupil.x, cy: 80 + pupil.y }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            />
            {/* brows — raised while watching */}
            <motion.path
              d="M78 64 Q88 58 98 64"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-background/70"
              animate={{ y: mood === 'watching' ? -3 : 0 }}
            />
            <motion.path
              d="M102 64 Q112 58 122 64"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className="stroke-background/70"
              animate={{ y: mood === 'watching' ? -3 : 0 }}
            />
          </g>
        ) : (
          // embarrassed closed eyes while covered
          <g>
            <path d="M80 82 Q88 90 96 82" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-foreground/60" />
            <path d="M104 82 Q112 90 120 82" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-foreground/60" />
          </g>
        )}
        {/* mouth */}
        <AnimatePresence mode="wait">
          <motion.path
            key={mood}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            d={
              mood === 'celebrating'
                ? 'M84 100 Q100 114 116 100'
                : mood === 'shaking'
                  ? 'M86 106 Q100 96 114 106'
                  : mood === 'covering'
                    ? 'M88 104 Q100 100 112 104'
                    : 'M86 98 Q100 108 114 98'
            }
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            className="stroke-foreground/80"
          />
        </AnimatePresence>
        {/* hands covering the eyes */}
        <AnimatePresence>
          {mood === 'covering' && (
            <>
              <motion.g
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              >
                <circle cx="88" cy="80" r="15" className="fill-primary-foreground stroke-foreground/20" strokeWidth="2" />
                <circle cx="112" cy="80" r="15" className="fill-primary-foreground stroke-foreground/20" strokeWidth="2" />
                <rect x="73" y="94" width="54" height="10" rx="5" className="fill-primary-foreground stroke-foreground/20" strokeWidth="2" />
              </motion.g>
            </>
          )}
        </AnimatePresence>
        {/* antenna */}
        <line x1="100" y1="34" x2="100" y2="20" strokeWidth="5" strokeLinecap="round" className="stroke-primary" />
        <motion.circle
          cx="100"
          cy="16"
          r="6"
          className="fill-primary"
          animate={{ opacity: mood === 'celebrating' ? [1, 0.3, 1, 0.3, 1] : 1 }}
          transition={{ duration: 0.9 }}
        />
        {/* cheeks */}
        {(mood === 'covering' || mood === 'celebrating') && (
          <>
            <ellipse cx="72" cy="96" rx="7" ry="4" className="fill-foreground/15" />
            <ellipse cx="128" cy="96" rx="7" ry="4" className="fill-foreground/15" />
          </>
        )}
      </motion.svg>
    </motion.div>
  );
}

/** Compact mascot for the navbar / 404 / empty states. */
export function MascotMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 190" className={className} aria-hidden="true">
      <rect x="48" y="34" width="104" height="130" rx="34" className="fill-primary" />
      <rect x="62" y="52" width="76" height="62" rx="14" className="fill-background" />
      <circle cx="88" cy="80" r="10" className="fill-foreground" />
      <circle cx="112" cy="80" r="10" className="fill-foreground" />
      <circle cx="88" cy="80" r="4" className="fill-background" />
      <circle cx="112" cy="80" r="4" className="fill-background" />
      <path d="M86 98 Q100 108 114 98" fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-foreground/80" />
      <line x1="100" y1="34" x2="100" y2="20" strokeWidth="5" strokeLinecap="round" className="stroke-primary" />
      <circle cx="100" cy="16" r="6" className="fill-primary" />
    </svg>
  );
}
