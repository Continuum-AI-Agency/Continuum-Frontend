'use client';

import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

type AgentWorkingIndicatorProps = {
  // 'inline'  — transient three-dot cue inside a pending assistant bubble, shown before
  //             the first token/tool-call lands and cleared the moment content streams.
  // 'pinned'  — persistent, high-contrast "working" bar pinned near the composer, driven
  //             purely by streaming state so it stays visible for the whole turn.
  variant?: 'inline' | 'pinned';
  label?: string;
};

// Shown before the first token or tool call lands (inline) or for the whole streaming
// turn near the composer (pinned), so a pending turn always reads as "working" instead
// of a silent, empty card.
export function AgentWorkingIndicator({
  variant = 'inline',
  label = 'Continuum is working…',
}: AgentWorkingIndicatorProps) {
  if (variant === 'pinned') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="mb-2 overflow-hidden rounded-lg border border-brand-primary/30 bg-brand-primary/5"
        role="status"
        aria-label={label}
      >
        <div className="flex items-center gap-2.5 px-3 py-2">
          <Loader2 className="size-4 shrink-0 animate-spin text-brand-primary" />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="h-0.5 w-full overflow-hidden bg-brand-primary/10">
          <motion.div
            className="h-full w-1/3 rounded-full bg-brand-primary"
            animate={{ x: ['-100%', '350%'] }}
            transition={{
              duration: 1.3,
              repeat: Number.POSITIVE_INFINITY,
              ease: 'easeInOut',
            }}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground/70"
      role="status"
      aria-label={label}
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground/50"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{
              duration: 1,
              repeat: Number.POSITIVE_INFINITY,
              delay: i * 0.18,
              ease: 'easeInOut',
            }}
          />
        ))}
      </span>
      <span>Working…</span>
    </div>
  );
}
