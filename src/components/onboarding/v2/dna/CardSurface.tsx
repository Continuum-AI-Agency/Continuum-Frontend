import { ArrowsCounterClockwise, MinusCircle, WarningCircle } from '@phosphor-icons/react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { SectionStatus } from '../state/agentPreview';
import { BreathingDot } from './BreathingDot';

type CardSurfaceProps = {
  title: string;
  badge?: string;
  chips?: ReactNode;
  findings?: ReactNode;
  status?: SectionStatus | 'indeterminate';
  isEmpty: boolean;
  minBodyHeight?: number;
  // When set, the body is capped at this height and scrolls — so a long
  // completed section can never stretch the card (or its grid row).
  maxBodyHeight?: number;
  skeleton?: ReactNode;
  errorMessage?: string;
  /** The run is over: nothing still pending is coming, so no card may keep drafting. */
  settled?: boolean;
  /** Offered on every card that ended without content. */
  onRetry?: () => void;
  children: ReactNode;
  className?: string;
};

type CardPhase = 'content' | 'loading' | 'error' | 'unavailable';

/**
 * Every card ends in content or says why it has none. A section that finished without
 * a payload is unavailable; one that failed, or was still running when the run ended,
 * is an error; only a live run may show a skeleton.
 */
function phaseOf(
  status: SectionStatus | 'indeterminate',
  isEmpty: boolean,
  settled: boolean,
): CardPhase {
  if (!isEmpty) return 'content';
  if (status === 'error') return 'error';
  if (status === 'skipped' || status === 'done') return 'unavailable';
  if (!settled) return 'loading';
  return status === 'running' ? 'error' : 'unavailable';
}

const DEFAULT_MIN_BODY_HEIGHT = 96;

export function CardSurface({
  title,
  badge,
  chips,
  findings,
  status = 'indeterminate',
  isEmpty,
  minBodyHeight = DEFAULT_MIN_BODY_HEIGHT,
  maxBodyHeight,
  skeleton,
  errorMessage,
  settled = false,
  onRetry,
  children,
  className,
}: CardSurfaceProps) {
  const phase = phaseOf(status, isEmpty, settled);

  let body: ReactNode;
  if (phase === 'error') {
    body = (
      <EndedEmpty
        icon={
          <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--cs-warning,#cb8e00)]" />
        }
        message={errorMessage ?? "We couldn't finish this section."}
        onRetry={onRetry}
      />
    );
  } else if (phase === 'unavailable') {
    body = (
      <EndedEmpty
        icon={<MinusCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />}
        message="Nothing came back for this section."
        onRetry={onRetry}
      />
    );
  } else if (phase === 'loading') {
    body = skeleton ?? <DefaultSkeleton />;
  } else {
    body = children;
  }

  // Cross-fade the body when it transitions between phases (skeleton → content,
  // etc.) so the swap reveals cleanly instead of snapping. The bounded
  // min/max-height keeps the card from resizing during the fade.
  return (
    <Card
      className={cn('border-border bg-card shadow-sm text-foreground', className)}
      data-testid="dna-card"
      data-card={title}
      data-phase={phase}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-center gap-2">
          {phase === 'loading' ? <BreathingDot tone="emerald" /> : null}
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {chips || badge ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {chips}
            {badge ? (
              <Badge
                variant="outline"
                className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {badge}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent
        className={cn(
          'space-y-3 text-sm leading-relaxed text-muted-foreground',
          maxBodyHeight ? 'overflow-y-auto' : undefined,
        )}
        style={{
          minHeight: minBodyHeight,
          ...(maxBodyHeight ? { maxHeight: maxBodyHeight } : {}),
        }}
      >
        <motion.div
          key={phase}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-3"
        >
          {body}
        </motion.div>
        {findings}
      </CardContent>
    </Card>
  );
}

function EndedEmpty({
  icon,
  message,
  onRetry,
}: {
  icon: ReactNode;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2.5 text-sm text-muted-foreground">
      <div className="flex items-start gap-2">
        {icon}
        <span>{message}</span>
      </div>
      {onRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          <ArrowsCounterClockwise aria-hidden className="h-3.5 w-3.5" />
          Re-run analysis
        </Button>
      ) : null}
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}
