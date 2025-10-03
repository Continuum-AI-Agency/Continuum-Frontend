"use client";

import { Card } from "@radix-ui/themes";
import { PropsWithChildren, forwardRef } from "react";
import { cn } from "../../lib/utils";

export type GlassCardProps = PropsWithChildren<{
  className?: string;
}>;

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { className, children },
  ref: React.Ref<HTMLDivElement>
) {
  return (
    <Card
      ref={ref}
      className={cn(
        "bg-white/55 dark:bg-black/30 backdrop-blur-md border-white/40 dark:border-white/10",
        "shadow-[0_10px_30px_rgba(0,0,0,0.08)] dark:shadow-[0_10px_30px_rgba(0,0,0,0.35)]",
        className
      )}
    >
      {children}
    </Card>
  );
});

export default GlassCard;
