'use client';

import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const FRAMES = ['⡡⠊⢔⠡', '⠊⡰⡡⡘', '⢔⢅⠈⢢', '⡁⢂⠆⡍', '⢔⠨⢑⢐', '⠨⡑⡠⠊'];

type SparkleSpinnerProps = {
  isActive: boolean;
  className?: string;
};

export function SparkleSpinner({ isActive, className }: SparkleSpinnerProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setFrame((i) => (i + 1) % FRAMES.length), 150);
    return () => clearInterval(id);
  }, [isActive]);

  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex items-center justify-center font-mono', className)}
    >
      <motion.span
        key={frame}
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: isActive ? 1 : 0.4, scale: 1 }}
        transition={{ duration: 0.08 }}
        className="text-base leading-none"
      >
        {FRAMES[frame]}
      </motion.span>
    </span>
  );
}
