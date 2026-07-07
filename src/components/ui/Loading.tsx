'use client';

import { AnimatePresence, motion } from 'motion/react';

export function Spinner({ size = 24 }: { size?: number }) {
  const radius = size / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="animate-spin text-primary"
      aria-hidden="true"
    >
      <circle
        cx={radius}
        cy={radius}
        r={radius - 3}
        stroke="currentColor"
        strokeWidth="3"
        fill="transparent"
        strokeDasharray="80"
        strokeDashoffset="60"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`rounded-md bg-muted animate-pulse ${className}`} />;
}

export function LoadingOverlay({ show, label = 'Loading...' }: { show: boolean; label?: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 backdrop-blur-sm"
        >
          <div className="rounded-lg border bg-card shadow-lg">
            <div className="flex items-center gap-3 p-4">
              <Spinner />
              <span className="text-sm">{label}</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
