// Layout primitives shared by the nine views: the view's lead, a titled block with its
// source line, a KPI tile and a finding card. Plain Tailwind on the app's tokens; every block
// is one column on a phone and joins a 12-column grid from `lg`.

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { caption, figureTile, label } from '../../typeScale';
import type { ChipTone } from '../dashboardModel';
import { StatusChip } from './StatusChip';

const SPAN_CLASS = {
  full: 'lg:col-span-12',
  wide: 'lg:col-span-7',
  narrow: 'lg:col-span-5',
  half: 'lg:col-span-6',
} as const;

export type BlockSpan = keyof typeof SPAN_CLASS;

export function ViewGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">{children}</div>;
}

export function ViewLead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1 lg:col-span-12">
      <h2 className="text-[21px] font-semibold leading-snug tracking-tight">{title}</h2>
      {children ? <p className="max-w-[90ch] text-sm text-muted-foreground">{children}</p> : null}
    </div>
  );
}

export function Block({
  title,
  subtitle,
  span = 'full',
  children,
  testId,
}: {
  title?: string;
  subtitle?: ReactNode;
  span?: BlockSpan;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 space-y-3 rounded-lg border border-border/60 bg-card p-4',
        SPAN_CLASS[span],
      )}
      data-testid={testId}
    >
      {title ? (
        <header className="space-y-0.5">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {subtitle ? <p className={cn(caption, 'text-muted-foreground')}>{subtitle}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={cn(caption, 'text-muted-foreground')}>{children}</p>;
}

export function KpiTile({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1 rounded-lg border border-border/60 bg-card p-3">
      <span className={cn(label, 'block font-semibold text-muted-foreground')}>{title}</span>
      <span className={cn(figureTile, 'block truncate')}>{value}</span>
      {detail ? <span className={cn(caption, 'block text-muted-foreground')}>{detail}</span> : null}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6 lg:col-span-12">
      {children}
    </div>
  );
}

export function FindingCard({
  tone,
  tag,
  title,
  text,
}: {
  tone: ChipTone;
  tag: string;
  title: string;
  text?: string;
}) {
  return (
    <article className="min-w-0 space-y-1.5 rounded-lg border border-border/60 bg-card p-3">
      <StatusChip tone={tone}>{tag}</StatusChip>
      <h4 className="text-sm font-semibold">{title}</h4>
      {text ? <p className={cn(caption, 'text-muted-foreground')}>{text}</p> : null}
    </article>
  );
}

export function FindingGrid({ children, single }: { children: ReactNode; single?: boolean }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3',
        single ? '' : 'md:grid-cols-2 xl:grid-cols-3 lg:col-span-12',
      )}
    >
      {children}
    </div>
  );
}
