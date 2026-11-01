'use client';

import { useState } from 'react';

/**
 * Mascot state machine shared by the auth pages (PRD §5):
 *  watching   → email/name field focused (eyes follow the cursor)
 *  covering   → password field focused (hands over the eyes)
 *  shaking    → authentication failure
 *  celebrating→ successful registration
 */
export function useMascotForm() {
  const [mood, setMood] = useState<import('@/components/mascot').MascotMood>('idle');

  const emailFocus = () => setMood('watching');
  const passwordFocus = () => setMood('covering');
  const blur = () => setMood('idle');
  const shake = () => {
    setMood('shaking');
    setTimeout(() => setMood('idle'), 600);
  };

  return { mood, setMood, emailFocus, passwordFocus, blur, shake };
}
