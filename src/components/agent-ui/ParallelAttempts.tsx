'use client';

// One task tried several ways at once: every attempt races as a row with its model, approach and
// a live bar, then gets a score ring. The best is marked and picked by default; any other
// finished attempt can be picked instead. Fed from sibling pipeline run receipts.

import { Check, Clock, Trophy } from 'lucide-react';
import { useState } from 'react';
import {
  AgentArtifactCard,
  AgentCardBody,
  AgentCardEyebrow,
  AgentCardHeader,
  AgentCardTitle,
  StatusLabel,
} from '@/components/shared/agent-cards/agentCardKit';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CardFooter } from '@/components/ui/card';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { type Attempt, bestAttempt, formatClock, formatUsd } from './model';
import { initials, ScoreRing } from './parts';

export function ParallelAttempts({
  attempts,
  pickedId,
  onPick,
  onUse,
  title,
  className,
}: {
  attempts: Attempt[];
  /** Controlled pick; left out, the component keeps its own and starts on the best. */
  pickedId?: string;
  onPick?: (attempt: Attempt) => void;
  /** Shown as the footer action once something is picked. */
  onUse?: (attempt: Attempt) => void;
  title?: string;
  className?: string;
}) {
  const best = bestAttempt(attempts);
  const [ownPick, setOwnPick] = useState<string>();
  const pickedAttempt = attempts.find((a) => a.id === (pickedId ?? ownPick ?? best));
  const finished = attempts.filter((a) => a.status === 'done' || a.status === 'failed').length;
  const racing = finished < attempts.length;

  const pick = (attempt: Attempt) => {
    setOwnPick(attempt.id);
    onPick?.(attempt);
  };

  return (
    <AgentArtifactCard className={cn('mt-0', className)}>
      <AgentCardHeader
        action={
          racing ? (
            <StatusLabel tone="running">
              Racing · {finished}/{attempts.length}
            </StatusLabel>
          ) : (
            <StatusLabel tone="done">All finished</StatusLabel>
          )
        }
      >
        <AgentCardEyebrow label="Parallel attempts" />
        <AgentCardTitle>{title ?? `Same brief, ${attempts.length} ways`}</AgentCardTitle>
      </AgentCardHeader>
      <AgentCardBody className="pt-3 pb-4">
        <ul className="flex flex-col gap-1.5">
          {attempts.map((attempt) => {
            const isPicked = attempt.id === pickedAttempt?.id;
            const isBest = attempt.id === best;
            const meta = [
              attempt.model,
              attempt.approach,
              attempt.costUsd !== undefined && formatUsd(attempt.costUsd),
              attempt.durationMs !== undefined && formatClock(attempt.durationMs),
            ].filter(Boolean);
            return (
              <li key={attempt.id}>
                <Item
                  render={<button type="button" disabled={attempt.status !== 'done'} />}
                  variant="outline"
                  size="sm"
                  aria-pressed={isPicked}
                  onClick={() => pick(attempt)}
                  className={cn(
                    'w-full text-left disabled:cursor-default',
                    isPicked
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/60 enabled:hover:border-foreground/20 enabled:hover:bg-muted/40',
                    attempt.status === 'failed' && 'opacity-70',
                  )}
                >
                  <ItemMedia>
                    <Avatar className="size-9 rounded-md">
                      <AvatarFallback
                        className={cn(
                          'rounded-md text-2xs font-semibold',
                          isPicked
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {initials(attempt.model ?? attempt.label)}
                      </AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="flex items-center gap-1.5">
                      <span className="truncate">{attempt.label}</span>
                      {isBest && (
                        <Badge variant="violet" className="px-1.5 text-3xs">
                          <Trophy />
                          Best
                        </Badge>
                      )}
                      {isPicked && !isBest && (
                        <Badge variant="secondary" className="px-1.5 text-3xs">
                          <Check />
                          Picked
                        </Badge>
                      )}
                    </ItemTitle>
                    <ItemDescription className="truncate text-2xs">
                      {attempt.status === 'failed' ? (
                        <span className="text-destructive">{attempt.error ?? 'Failed'}</span>
                      ) : (
                        meta.join(' · ')
                      )}
                    </ItemDescription>
                    {attempt.status === 'running' && (
                      <Progress
                        value={Math.round((attempt.progress ?? 0) * 100)}
                        className="mt-1 h-1"
                      />
                    )}
                  </ItemContent>
                  <ItemActions>
                    {attempt.status === 'done' && attempt.score !== undefined && (
                      <ScoreRing score={attempt.score} emphasis={isBest || isPicked} />
                    )}
                    {attempt.status === 'running' && (
                      <span className="grid size-10 place-items-center">
                        <Spinner className="text-primary" />
                      </span>
                    )}
                    {attempt.status === 'queued' && (
                      <Badge variant="muted" className="text-3xs">
                        <Clock />
                        Queued
                      </Badge>
                    )}
                    {attempt.status === 'failed' && (
                      <Badge variant="destructive" className="text-3xs">
                        Failed
                      </Badge>
                    )}
                  </ItemActions>
                </Item>
              </li>
            );
          })}
        </ul>
      </AgentCardBody>
      {pickedAttempt && (
        <CardFooter className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5 text-xs">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            Picked <span className="font-medium text-foreground">{pickedAttempt.label}</span>
            {pickedAttempt.score !== undefined && (
              <> · scored {Math.round(pickedAttempt.score * 100)}</>
            )}
          </span>
          {onUse && (
            <Button size="sm" onClick={() => onUse(pickedAttempt)}>
              Use this one
            </Button>
          )}
        </CardFooter>
      )}
    </AgentArtifactCard>
  );
}
