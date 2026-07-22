'use client';

import { motion } from 'motion/react';
import {
  Task,
  TaskContent,
  TaskItem,
  type TaskStatus,
  TaskTrigger,
} from '@/components/ai-elements/task';
import type { JainaObjective } from '@/lib/jaina/schemas';
import { cn } from '@/lib/utils';

type ObjectivesQueueProps = {
  objectives: JainaObjective[];
  isStreaming: boolean;
};

export function ObjectivesQueue({ objectives, isStreaming }: ObjectivesQueueProps) {
  if (objectives.length === 0) return null;

  const completedCount = objectives.filter((o) => o.status === 'completed').length;
  const total = objectives.length;
  const hasFailed = objectives.some((o) => o.status === 'failed');
  const hasInProgress = objectives.some((o) => o.status === 'in_progress');
  const taskStatus: TaskStatus =
    completedCount === total
      ? 'completed'
      : hasFailed && !hasInProgress
        ? 'error'
        : isStreaming || hasInProgress
          ? 'in_progress'
          : 'pending';

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5"
    >
      <Task status={taskStatus} defaultOpen={false}>
        <TaskTrigger
          title={`${total} objective${total !== 1 ? 's' : ''}`}
          status={taskStatus}
          progress={{ current: completedCount, total }}
        />
        <TaskContent className="text-xs">
          {objectives.map((objective) => (
            <TaskItem key={objective.id} className="text-xs">
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'leading-snug',
                    objective.status === 'completed' &&
                      'line-through text-muted-foreground opacity-65',
                    objective.status === 'failed' && 'text-destructive',
                  )}
                >
                  {objective.title}
                </p>
                {objective.description ? (
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground/60">
                    {objective.description}
                  </p>
                ) : null}
              </div>
            </TaskItem>
          ))}
        </TaskContent>
      </Task>
    </motion.div>
  );
}
