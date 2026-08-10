'use client';
import { Check, RotateCw, X } from 'lucide-react';

import { Pill } from '@/components/kibo-ui/pill';
import { Progress } from '@/components/ui/progress';
import type { GridStatus } from '@/lib/organic/store';
import { cn } from '@/lib/utils';

type StageVariant = 'teal' | 'warning' | 'violet' | 'success';

const stageVariants: Record<string, StageVariant> = {
  analyzing: 'teal',
  optimizing: 'warning',
  drafting: 'violet',
  matching: 'teal',
  finalizing: 'success',
};

const stageLabels: Record<string, string> = {
  analyzing: 'Analyzing',
  optimizing: 'Optimizing',
  drafting: 'Drafting',
  matching: 'Matching',
  finalizing: 'Finalizing',
};

interface GenerationProgressPanelProps {
  status: GridStatus;
  percent: number;
  message?: string;
  stage?: string;
  error?: string | null;
}

export function GenerationProgressPanel({
  status,
  percent,
  message,
  stage,
  error,
}: GenerationProgressPanelProps) {
  if (status === 'idle') {
    return null;
  }

  const isError = status === 'error' || error;
  const isComplete = status === 'complete';
  const isCompleteWithErrors = status === 'complete_with_errors';
  const stageVariant: StageVariant | 'muted' = stage ? (stageVariants[stage] ?? 'muted') : 'muted';
  const stageLabel = stage ? stageLabels[stage] : 'Processing';

  return (
    <div
      data-testid="generation-progress-panel"
      className="rounded-lg border bg-card text-card-foreground"
    >
      <div className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isError ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <X className="w-4 h-4" />
                </div>
              ) : isComplete ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success">
                  <Check className="w-4 h-4" />
                </div>
              ) : isCompleteWithErrors ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 text-warning">
                  <X className="w-4 h-4" />
                </div>
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 text-warning animate-spin">
                  <RotateCw className="w-4 h-4" />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-base font-semibold">
                  {isError
                    ? 'Generation Failed'
                    : isComplete
                      ? 'Generation Complete'
                      : isCompleteWithErrors
                        ? 'Generation Complete with Failures'
                        : 'Generating Content'}
                </span>
                {!isError && !isComplete && !isCompleteWithErrors && stage && (
                  <Pill variant={stageVariant} className="w-fit">
                    {stageLabel}
                  </Pill>
                )}
              </div>
            </div>

            {!isError && (
              <span className="text-xl font-semibold text-muted-foreground">{percent}%</span>
            )}
          </div>

          {!isError && (
            <Progress
              value={percent}
              data-testid="generation-progress-bar"
              className={cn(
                isComplete && '[&>div]:bg-success',
                isCompleteWithErrors && '[&>div]:bg-warning',
                isError && '[&>div]:bg-destructive',
              )}
            />
          )}

          {message && !isError && <span className="text-sm text-muted-foreground">{message}</span>}

          {isError && error && (
            <div
              className="p-3 rounded-md bg-destructive/10 border border-destructive/30"
              role="alert"
              aria-live="assertive"
            >
              <span className="text-sm text-destructive">{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
