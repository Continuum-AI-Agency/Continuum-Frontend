"use client";

import { Question } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface HelpPopoverProps {
  label: string;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

export function HelpPopover({ label, children, className, align = "start" }: HelpPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded-full",
          "text-muted-foreground/70 hover:text-foreground",
          "motion-safe:transition-colors motion-safe:duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]",
          className,
        )}
      >
        <Question className="h-3.5 w-3.5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-80 text-[0.875rem] leading-[1.4]"
      >
        <div className="space-y-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
