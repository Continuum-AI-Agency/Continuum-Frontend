"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type MessageProps = {
  role: "user" | "assistant" | "system";
  children: React.ReactNode;
};

export function Message({ role, children }: MessageProps) {
  const isUser = role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex w-full gap-3",
        isUser ? "flex-row-reverse justify-end" : "flex-row justify-start"
      )}
    >
      <div
        className={cn(
          "mt-1 size-7 shrink-0 rounded-full flex items-center justify-center text-xs font-medium select-none",
          isUser ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        )}
        aria-hidden="true"
      >
        {isUser ? "U" : "A"}
      </div>
      <div
        className={cn(
          "px-4 py-2.5 text-base leading-relaxed shadow-sm",
          isUser
            ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-muted text-foreground font-medium"
            : "min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-border/50 bg-card/80 text-foreground"
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}
