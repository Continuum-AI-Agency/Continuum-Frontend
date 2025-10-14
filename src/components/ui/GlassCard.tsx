"use client";

import { Card } from "@radix-ui/themes";
import { PropsWithChildren, forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

export type GlassCardProps = PropsWithChildren<{
  className?: string;
}>;

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { className, children },
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <motion.div
      ref={ref}
      whileHover={{ scale: 1.025, y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="h-full"
    >
      <Card
        className={cn(
          "h-full bg-card text-card-foreground border border-border/60 shadow-lg",
          className
        )}
      >
        {children}
      </Card>
    </motion.div>
  );
});

export default GlassCard;
