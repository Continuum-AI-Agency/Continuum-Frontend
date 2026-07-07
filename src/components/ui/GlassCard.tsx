'use client';

import { motion } from 'motion/react';
import { forwardRef, type PropsWithChildren } from 'react';
import { cn } from '../../lib/utils';

export type GlassCardProps = PropsWithChildren<{
  className?: string;
}>;

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { className, children },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      whileHover={{ scale: 1.025, y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="h-full motion-safe:will-change-transform"
    >
      <div
        className={cn(
          'h-full rounded-lg border border-border/60 bg-card text-card-foreground shadow-lg',
          className,
        )}
      >
        {children}
      </div>
    </motion.div>
  );
});

export default GlassCard;
