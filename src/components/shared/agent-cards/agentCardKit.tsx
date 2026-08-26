'use client';

import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';

/**
 * Shared minimal card language for in-chat agent output (plan, bulk, pipeline,
 * trend, concept). One restrained surface, neutral-first meta, a single brand
 * accent reserved for state. Replaces the per-card rainbow-chip clutter.
 */

type AgentCardVariant = 'receipt' | 'artifact' | 'decision';

const AGENT_CARD_VARIANTS: Record<AgentCardVariant, string> = {
  receipt: 'rounded-lg border-border/40 bg-muted/20 py-0 shadow-none',
  artifact: 'overflow-hidden rounded-lg border-border/45 bg-card/75 py-0 shadow-none',
  decision: 'rounded-lg border-border/50 bg-card/80 py-0 shadow-none',
};

type AgentCardFrameProps = React.ComponentProps<'div'> & {
  variant?: AgentCardVariant;
};

export function AgentCardFrame({ variant = 'decision', className, ...props }: AgentCardFrameProps) {
  return (
    <Card
      className={cn(
        'mt-2 gap-0 text-sm text-card-foreground',
        AGENT_CARD_VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}

export function AgentReceipt(props: Omit<AgentCardFrameProps, 'variant'>) {
  return <AgentCardFrame variant="receipt" {...props} />;
}

export function AgentArtifactCard(props: Omit<AgentCardFrameProps, 'variant'>) {
  return <AgentCardFrame variant="artifact" {...props} />;
}

export function AgentDecisionCard(props: Omit<AgentCardFrameProps, 'variant'>) {
  return <AgentCardFrame variant="decision" {...props} />;
}

// Compatibility wrapper for existing card call sites. New code should choose
// AgentReceipt, AgentArtifactCard, or AgentDecisionCard explicitly.
export function AgentCard({ className, ...props }: React.ComponentProps<'div'>) {
  return <AgentDecisionCard className={cn('p-4', className)} {...props} />;
}

export function AgentCardHeader({
  children,
  className,
  action,
  ...props
}: React.ComponentProps<'div'> & { action?: React.ReactNode }) {
  return (
    <CardHeader className={cn('gap-1.5 px-4 pt-4 pb-0', className)} {...props}>
      {action ? (
        <>
          <div className="min-w-0">{children}</div>
          <CardAction>{action}</CardAction>
        </>
      ) : (
        children
      )}
    </CardHeader>
  );
}

export function AgentCardBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <CardContent className={cn('px-4', className)} {...props} />;
}

export function AgentActions({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <CardFooter
      className={cn('mt-4 flex items-center justify-end gap-1 px-0', className)}
      {...props}
    />
  );
}

export function AgentCardEyebrow({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-medium tracking-normal text-muted-foreground">{label}</span>
      {right}
    </div>
  );
}

export function AgentCardTitle({ children }: { children: React.ReactNode }) {
  return (
    <CardTitle className="mt-2 text-base font-semibold leading-snug text-foreground text-pretty">
      {children}
    </CardTitle>
  );
}

export function AgentCardSummary({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">{children}</p>
  );
}

// `waiting` is the state the first four tones could not say: work has STOPPED and the
// ball is in the user's court. Green would overstate readiness; the pulsing `running`
// amber claims a job is still moving when nothing is. Same amber, solid dot.
type StatusTone = 'neutral' | 'running' | 'waiting' | 'done' | 'failed';

const STATUS_TEXT: Record<StatusTone, string> = {
  neutral: 'text-muted-foreground',
  running: 'text-amber-600 dark:text-amber-400',
  waiting: 'text-amber-600 dark:text-amber-400',
  done: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
};

const STATUS_DOT: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/40',
  running: 'bg-amber-500',
  waiting: 'bg-amber-500',
  done: 'bg-emerald-500',
  failed: 'bg-destructive',
};

export function StatusLabel({
  tone = 'neutral',
  title,
  detail,
  children,
}: {
  tone?: StatusTone;
  /** Engineer-facing diagnostic. Never render a diagnostic as the visible label. */
  title?: string;
  /**
   * What is actually happening, for someone who wants to know rather than debug: the
   * agent at work, the stage, the percent, the checkpoint ladder. A native `title=` holds
   * one unstyled line after a browser-controlled delay, which is why nobody ever read it.
   */
  detail?: React.ReactNode;
  children: React.ReactNode;
}) {
  const badge = (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        'h-auto shrink-0 gap-1.5 rounded-md border-transparent bg-transparent px-0 py-0 text-xs font-medium tabular-nums shadow-none hover:bg-transparent',
        STATUS_TEXT[tone],
        detail && 'cursor-default',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          STATUS_DOT[tone],
          tone === 'running' && 'animate-pulse',
        )}
      />
      {children}
    </Badge>
  );

  if (!detail) return badge;

  return (
    <HoverCard closeDelay={80} openDelay={160}>
      {/* Base UI renders the trigger as an anchor; a status is not a link. */}
      <HoverCardTrigger render={<span className="shrink-0">{badge}</span>} />
      <HoverCardContent align="end" className="w-64 p-3" side="bottom">
        {detail}
      </HoverCardContent>
    </HoverCard>
  );
}

// Per-platform color identity — the one place color is intentionally used for
// recognition rather than state. Everything else in a card stays neutral.
const PLATFORM_COLOR: Record<string, string> = {
  instagram: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300',
  tiktok: 'bg-pink-500/15 text-pink-700 dark:text-pink-300',
  linkedin: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  facebook: 'bg-blue-600/15 text-blue-700 dark:text-blue-300',
  youtube: 'bg-red-500/15 text-red-700 dark:text-red-300',
  twitter: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',
};

export function PlatformTag({ platform, className }: { platform: string; className?: string }) {
  const color = PLATFORM_COLOR[platform] ?? 'bg-muted text-muted-foreground';
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-auto shrink-0 rounded-md border-transparent px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide shadow-none hover:bg-muted',
        color,
        className,
      )}
    >
      {platform}
    </Badge>
  );
}

/**
 * Neutral meta line — `Reel · Wed 9:00 AM · Save`. The first item reads as the
 * primary label; the rest are muted, middot-separated. Pair with PlatformTag
 * for platform color; everything else stays neutral.
 */
export function MetaRow({
  items,
  className,
}: {
  items: Array<string | null | undefined>;
  className?: string;
}) {
  const parts = items.filter((p): p is string => Boolean(p && p.trim()));
  if (parts.length === 0) return null;
  return (
    <p
      className={cn(
        'flex flex-wrap items-center text-xs leading-snug text-muted-foreground',
        className,
      )}
    >
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="px-1.5 text-muted-foreground/40">·</span>}
          <span className={cn(i === 0 && 'font-medium capitalize text-foreground/80')}>{part}</span>
        </React.Fragment>
      ))}
    </p>
  );
}

type AgentButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
};

export function AgentButton({
  variant = 'primary',
  loading,
  className,
  children,
  disabled,
  ...props
}: AgentButtonProps) {
  return (
    <Button
      variant={variant === 'primary' ? 'brand' : 'ghost'}
      size="sm"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'min-h-9 gap-1.5 rounded-lg px-3.5 text-sm',
        'transition-[transform,opacity,background-color,color] duration-150 ease-out',
        'active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40',
        variant === 'ghost' && 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {variant === 'primary' && <span>Starting…</span>}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/**
 * Footer approve/reject pair. Reject is de-emphasized (ghost) so the primary
 * action carries the hierarchy.
 */
export function ApproveRejectActions({
  locked,
  loading,
  approveLabel,
  onApprove,
  onReject,
}: {
  locked: boolean;
  loading?: boolean;
  approveLabel: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <AgentActions>
      <AgentButton variant="ghost" disabled={locked || loading} onClick={onReject}>
        Dismiss
      </AgentButton>
      <AgentButton variant="primary" disabled={locked} loading={loading} onClick={onApprove}>
        {approveLabel}
      </AgentButton>
    </AgentActions>
  );
}
