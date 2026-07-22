'use client';

import { type HTMLMotionProps, motion, type Variants } from 'motion/react';
import type { PropsWithChildren } from 'react';

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (custom: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut', delay: custom },
  }),
};

export const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export const staggerFast: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};

// For icon swaps and pop-in effects
export const scaleIn: Variants = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.15, ease: EASE_OUT_EXPO } },
  exit: { scale: 0.5, opacity: 0, transition: { duration: 0.1 } },
};

// For list rows — use as child of stagger/staggerFast
export const listItem: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: EASE_OUT_EXPO } },
};

export function MotionBox({ children, ...props }: PropsWithChildren<HTMLMotionProps<'div'>>) {
  return (
    <motion.div initial="hidden" animate="visible" variants={stagger} {...props}>
      {children}
    </motion.div>
  );
}
