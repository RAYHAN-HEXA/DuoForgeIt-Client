'use client';

import { useEffect, useRef } from 'react';
import { useInView, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

/**
 * Counts up to `value` when scrolled into view. Renders the final value on the
 * server and for reduced-motion users, so there is never an empty stat.
 */
export function AnimatedCounter({
  value,
  className,
  prefix = '',
  suffix = '',
  decimals = 0,
}: {
  value: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(0);
  const spring = useSpring(motionValue, { stiffness: 90, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (!inView || reduced) return;
    motionValue.set(value);
  }, [inView, value, motionValue, reduced]);

  useEffect(() => {
    if (reduced || !inView) return;
    return spring.on('change', (latest) => {
      if (!ref.current) return;
      const formatted = decimals > 0 ? latest.toFixed(decimals) : Math.round(latest).toLocaleString();
      ref.current.textContent = `${prefix}${formatted}${suffix}`;
    });
  }, [inView, spring, decimals, prefix, suffix, reduced]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {decimals > 0 ? value.toFixed(decimals) : value.toLocaleString()}
      {suffix}
    </span>
  );
}
