'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

const WELCOME_SEEN_KEY = 'continuum:welcome-seen';

interface WelcomeScreenProps {
  onDismiss: () => void;
}

export function WelcomeScreen({ onDismiss }: WelcomeScreenProps) {
  const shouldReduceMotion = useReducedMotion();
  const [revealCta, setRevealCta] = useState(shouldReduceMotion ?? false);

  useEffect(() => {
    if (shouldReduceMotion) {
      setRevealCta(true);
      return;
    }
    const timer = window.setTimeout(() => setRevealCta(true), 1200);
    return () => window.clearTimeout(timer);
  }, [shouldReduceMotion]);

  const handleContinue = () => {
    try {
      window.localStorage.setItem(WELCOME_SEEN_KEY, '1');
    } catch {
      // localStorage may be unavailable (private mode); ignore — flag is best-effort.
    }
    onDismiss();
  };

  return (
    <motion.div
      role="dialog"
      aria-labelledby="welcome-heading"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background px-6 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.15 }}
    >
      <div className="flex w-full max-w-3xl flex-col items-center gap-12 text-center">
        <h1
          id="welcome-heading"
          className="text-balance text-[1.75rem] font-semibold leading-[1.2] text-foreground sm:text-[2.25rem] md:text-[2.75rem]"
          aria-label="Welcome to your Brand's Scaling Journey with Continuum"
        >
          <motion.span
            className="block"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.28,
              delay: shouldReduceMotion ? 0 : 0.1,
              ease: [0, 0, 0.2, 1],
            }}
          >
            Welcome to your Brand&apos;s Scaling Journey with
          </motion.span>
          <motion.span
            className="mt-3 block font-extrabold tracking-tight text-primary"
            style={{
              fontSize: '1.4em',
              lineHeight: 1.1,
            }}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.28,
              delay: shouldReduceMotion ? 0 : 0.28,
              ease: [0, 0, 0.2, 1],
            }}
          >
            Continuum
          </motion.span>
        </h1>

        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={revealCta ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0, 0, 0.2, 1] }}
        >
          <Button
            variant="default"
            size="lg"
            onClick={handleContinue}
            autoFocus
            className="min-w-[12rem]"
          >
            Get started
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

export function hasSeenWelcome(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(WELCOME_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}
