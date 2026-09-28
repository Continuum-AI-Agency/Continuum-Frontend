'use client';

import {
  Ban,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  Clock3,
  LoaderCircle,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { Task, TaskContent, type TaskStatus, TaskTrigger } from '@/components/ai-elements/task';
import type { JainaObjective, JainaObjectiveStatus } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';
import {
  OBJECTIVE_STATUS_LABEL,
  objectiveReasonText,
  summarizeObjectiveProgress,
} from '../objectiveStatus';

type ObjectivesQueueProps = {
  objectives: JainaObjective[];
  isStreaming: boolean;
};

type StatusLook = { icon: LucideIcon; iconClassName: string; titleClassName?: string };

const STATUS_LOOK: Readonly<Record<JainaObjectiveStatus, StatusLook>> = {
  completed: {
    icon: CircleCheck,
    iconClassName: 'text-indigo-500',
    titleClassName: 'line-through text-muted-foreground opacity-65',
  },
  in_progress: {
    icon: LoaderCircle,
    iconClassName: 'text-indigo-400 animate-spin',
    titleClassName: 'text-foreground',
  },
  partial: { icon: CircleDashed, iconClassName: 'text-amber-500' },
  deferred: { icon: Clock3, iconClassName: 'text-muted-foreground/70' },
  blocked: { icon: Ban, iconClassName: 'text-amber-600' },
  failed: { icon: CircleX, iconClassName: 'text-destructive', titleClassName: 'text-destructive' },
  cancelled: {
    icon: CircleMinus,
    iconClassName: 'text-muted-foreground/50',
    titleClassName: 'line-through text-muted-foreground/60',
  },
  pending: { icon: Circle, iconClassName: 'text-muted-foreground/40' },
};

/**
 * Once the turn is over nothing is still being worked on: an objective the backend left
 * `in_progress` would otherwise spin forever and read as "Jaina is stuck".
 */
const displayedObjective = (objective: JainaObjective, isStreaming: boolean) =>
  objective.status === 'in_progress' && !isStreaming
    ? {
        status: 'deferred' as const,
        reason: objectiveReasonText('turn_ended_in_progress', null),
      }
    : {
        status: objective.status,
        reason: objectiveReasonText(objective.reason_code, objective.details),
      };

export function ObjectivesQueue({ objectives, isStreaming }: ObjectivesQueueProps) {
  if (objectives.length === 0) return null;

  const { completed, partial, total } = summarizeObjectiveProgress(objectives);
  const hasFailed = objectives.some((o) => o.status === 'failed');
  const hasInProgress = isStreaming && objectives.some((o) => o.status === 'in_progress');
  const taskStatus: TaskStatus =
    completed === total
      ? 'completed'
      : hasFailed && !hasInProgress
        ? 'error'
        : isStreaming || hasInProgress
          ? 'in_progress'
          : 'pending';
  const title = [
    `${total} objetivo${total !== 1 ? 's' : ''}`,
    partial > 0 ? `${partial} parcial${partial !== 1 ? 'es' : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
    >
      <Task status={taskStatus} defaultOpen={false}>
        <TaskTrigger title={title} status={taskStatus} progress={{ current: completed, total }} />
        <TaskContent className="text-xs">
          {objectives.map((objective) => {
            const { status, reason } = displayedObjective(objective, isStreaming);
            const look = STATUS_LOOK[status];
            const Icon = look.icon;
            return (
              <div
                key={objective.id}
                data-testid="objective-row"
                data-status={status}
                className="flex items-start gap-2 text-xs text-muted-foreground"
              >
                <Icon
                  data-testid="objective-icon"
                  data-icon={status}
                  aria-hidden
                  className={cn('mt-0.5 size-3.5 shrink-0', look.iconClassName)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={cn('min-w-0 flex-1 leading-snug', look.titleClassName)}>
                      {objective.title}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground/70">
                      {OBJECTIVE_STATUS_LABEL[status]}
                    </span>
                  </div>
                  {reason ? (
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground/80">{reason}</p>
                  ) : objective.description ? (
                    <p className="mt-0.5 text-xs leading-snug text-muted-foreground/60">
                      {objective.description}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </TaskContent>
      </Task>
    </motion.div>
  );
}
