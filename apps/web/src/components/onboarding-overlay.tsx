'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, FolderOpen, MonitorSmartphone, Power } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

/**
 * 2.5s "digital workstation boot" shown once per session after a successful
 * registration (PRD §6). Not shown on normal page navigation — keyed off
 * sessionStorage + registration events. Reduced-motion users get a static
 * welcome card instead of the animation.
 */

const BOOT_STEPS = [
  { icon: Power, label: 'Powering up…', ms: 550 },
  { icon: MonitorSmartphone, label: 'Compiling your workspace…', ms: 700 },
  { icon: FolderOpen, label: 'Organizing documents…', ms: 650 },
  { icon: Check, label: 'Workspace ready', ms: 500 },
];

const STORAGE_KEY = 'tsh-onboarding-seen';

export function showOnboarding() {
  sessionStorage.setItem(STORAGE_KEY, 'pending');
}

export function OnboardingOverlay() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // deferred to a macrotask so we never setState synchronously in the effect
    const t = setTimeout(() => {
      if (sessionStorage.getItem(STORAGE_KEY) === 'pending' && user) {
        sessionStorage.setItem(STORAGE_KEY, 'done');
        setVisible(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    if (!visible) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (const [i, s] of BOOT_STEPS.entries()) {
      acc += s.ms;
      timers.push(setTimeout(() => setStep(i + 1), acc));
    }
    timers.push(setTimeout(() => setVisible(false), acc + 900));
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  const name = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="status"
        >
          <motion.div
            className="relative w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-primary/20 bg-card p-6 shadow-glow"
            initial={reduceMotion ? false : { scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { scale: 0.95, opacity: 0 }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-aurora-rich opacity-40"
            />
            <div className="relative mx-auto flex w-fit flex-col items-center gap-4 text-center">
              <div className="relative flex h-28 w-28 items-center justify-center rounded-xl border border-primary/20 bg-background shadow-soft">
                {/* a little monitor that boots */}
                <motion.div
                  className="absolute inset-2 rounded-lg bg-primary/10"
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: step > 0 ? 1 : 0.02 }}
                  transition={{ duration: reduceMotion ? 0 : 0.4 }}
                />
                <MonitorSmartphone className="relative z-10 h-10 w-10 text-primary" />
                <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-1">
                  {BOOT_STEPS.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-1.5 rounded-full ${i < step ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="font-heading font-medium">
                  Welcome to TechService Hub, {name}. Let&apos;s build something great!
                </p>
                <div className="flex h-5 items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={step}
                      initial={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                      className="flex items-center gap-1.5"
                    >
                      {step < BOOT_STEPS.length ? (
                        <>
                          {(() => {
                            const Icon = BOOT_STEPS[step]!.icon;
                            return <Icon className="h-4 w-4 animate-pulse" />;
                          })()}
                          {BOOT_STEPS[step]!.label}
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 text-primary" />
                          Ready
                        </>
                      )}
                    </motion.span>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
