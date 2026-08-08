import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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

  // Most call sites pass a bare title, and a flex box around a single child is a
  // DOM level that renders identically without it. The right cluster keeps its
  // wrapper unconditionally — that is where shrink-0 lives, and without it a long
  // title would compress the action link instead of truncating itself.
  const needsLeftGroup = Boolean(eyebrow) && Boolean(title);

  const eyebrowNode = eyebrow ? (
    <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-muted-foreground">
      {eyebrow}
    </span>
  ) : null;

  const titleNode = title ? (
    <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </p>
  ) : null;

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-between gap-2 border-b border-border px-[var(--card-pad)] py-[var(--section-header-pad-block)]',
        className,
      )}
    >
      {needsLeftGroup ? (
        <div className="flex min-w-0 items-center gap-2">
          {eyebrowNode}
          {titleNode}
        </div>
      ) : (
        (eyebrowNode ?? titleNode)
      )}
      {meta || action ? (
        <div className="flex shrink-0 items-center gap-3">
          {meta}
          {action}
        </div>
      ) : null}
    </div>
  );
}
