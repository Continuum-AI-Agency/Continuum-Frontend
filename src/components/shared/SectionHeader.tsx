import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  title?: ReactNode;
  eyebrow?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
};

// The canonical panel header bar used across every module/panel: a hairline
// bottom border, an uppercase muted title on the left, and an optional meta +
// action cluster (e.g. a metric label and a ModuleShortcutLink) on the right.
// Import this instead of hand-rolling the justify-between/border-b header.
export function SectionHeader({ title, eyebrow, meta, action, className }: SectionHeaderProps) {
  if (!title && !eyebrow && !meta && !action) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {eyebrow ? (
          <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </span>
        ) : null}
        {title ? (
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
        ) : null}
      </div>
      {meta || action ? (
        <div className="flex shrink-0 items-center gap-3">
          {meta}
          {action}
        </div>
      ) : null}
    </div>
  );
}
