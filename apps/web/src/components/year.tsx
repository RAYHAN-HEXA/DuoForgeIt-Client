'use client';

import { useEffect, useState } from 'react';

/** Year via effect — `new Date()` is unstable during prerender (cacheComponents). */
export function CurrentYear() {
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    // deferred to a macrotask: no synchronous setState in the effect body
    const t = setTimeout(() => setYear(new Date().getFullYear()), 0);
    return () => clearTimeout(t);
  }, []);
  return <>{year ?? ''}</>;
}
