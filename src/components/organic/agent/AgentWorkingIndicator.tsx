"use client";

import { motion } from "motion/react";

// Shown inside an assistant bubble before the first token or tool call lands, so
// a pending turn reads as "working" instead of an empty card. Clears as soon as
// the first delta/tool-call arrives (the panel swaps it for the real content).
export function AgentWorkingIndicator() {
  return (
    <div
      className="flex items-center gap-2 py-0.5 text-[13px] text-muted-foreground/70"
      role="status"
      aria-label="Agent is working"
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-muted-foreground/50"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, delay: i * 0.18, ease: "easeInOut" }}
          />
        ))}
      </span>
      <span>Working…</span>
    </div>
  );
}
