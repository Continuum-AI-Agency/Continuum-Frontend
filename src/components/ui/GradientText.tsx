"use client";

import { PropsWithChildren } from "react";
import { cn } from "../../lib/utils";

export type GradientTextProps = PropsWithChildren<{
  className?: string;
}>;

export function GradientText({ children, className }: GradientTextProps) {
  return (
    <span
      className={cn(
        "bg-clip-text text-transparent",
        "bg-[linear-gradient(95deg,theme(colors.primary),theme(colors.accent))]",
        "dark:bg-[linear-gradient(95deg,#A08CCF,#53A88A)]",
        className
      )}
    >
      {children}
    </span>
  );
}

export default GradientText;
