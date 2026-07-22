'use client';

import { motion } from 'motion/react';
import { memo } from 'react';
import { cn } from '@/lib/utils';

type BreathingDotProps = {
  tone?: 'emerald' | 'amber' | 'rose';
  className?: string;
};

const TONE_CLASSES: Record<NonNullable<BreathingDotProps['tone']>, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};

export const BreathingDot = memo(function BreathingDot({
  tone = 'emerald',
  className,
}: BreathingDotProps) {
  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
        TONE_CLASSES[tone],
        className,
      )}
      animate={{ scale: [1, 1.4, 1], opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
});
