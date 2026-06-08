"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  KIND_FILTERS,
  SOURCE_FILTERS,
  type KindFilterValue,
  type SourceFilterValue,
} from "@/lib/media/filters";
import { cn } from "@/lib/utils";

type Props = {
  source: SourceFilterValue;
  kind: KindFilterValue;
  onSourceChange: (value: SourceFilterValue) => void;
  onKindChange: (value: KindFilterValue) => void;
  // Visual density: "page" for the library route, "compact" for the studio sheet.
  variant?: "page" | "compact";
  className?: string;
};

export function LibraryFilterBar({
  source,
  kind,
  onSourceChange,
  onKindChange,
  variant = "page",
  className,
}: Props) {
  const reduceMotion = useReducedMotion();
  const layoutId = variant === "compact" ? "studio-filter-pill" : "library-filter-pill";

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <ChipRow
        options={SOURCE_FILTERS}
        active={source}
        onSelect={onSourceChange}
        layoutId={`${layoutId}-source`}
        reduceMotion={!!reduceMotion}
        variant={variant}
      />
      <ChipRow
        options={KIND_FILTERS}
        active={kind}
        onSelect={onKindChange}
        layoutId={`${layoutId}-kind`}
        reduceMotion={!!reduceMotion}
        variant={variant}
      />
    </div>
  );
}

function ChipRow<T extends string>({
  options,
  active,
  onSelect,
  layoutId,
  reduceMotion,
  variant,
}: {
  options: readonly { value: T; label: string }[];
  active: T;
  onSelect: (value: T) => void;
  layoutId: string;
  reduceMotion: boolean;
  variant: "page" | "compact";
}) {
  const compact = variant === "compact";
  return (
    <div
      role="group"
      className={cn(
        "inline-flex items-center rounded-full p-0.5",
        compact ? "bg-white/5" : "bg-muted/60",
      )}
    >
      {options.map((opt) => {
        const isActive = opt.value === active;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            aria-pressed={isActive}
            className={cn(
              "relative min-h-8 rounded-full px-3 text-xs font-medium tabular-nums",
              "transition-[color] [transition-property:color] active:scale-[0.96]",
              compact
                ? isActive
                  ? "text-white"
                  : "text-white/55 hover:text-white/80"
                : isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            {isActive && (
              <motion.span
                layoutId={layoutId}
                className={cn(
                  "absolute inset-0 rounded-full shadow-sm",
                  compact ? "bg-white/15" : "bg-background",
                )}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", bounce: 0, duration: 0.3 }
                }
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
