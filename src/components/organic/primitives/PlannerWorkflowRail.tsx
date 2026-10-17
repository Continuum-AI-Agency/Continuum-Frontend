import { Check, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PlannerStage = 'plan' | 'generate' | 'review' | 'schedule';

const STAGES: Array<{ id: PlannerStage; label: string }> = [
  { id: 'plan', label: 'Plan' },
  { id: 'generate', label: 'Generate' },
  { id: 'review', label: 'Review' },
  { id: 'schedule', label: 'Schedule' },
];

type ResolvePlannerStageInput = {
  draftsCount: number;
  scheduledCount: number;
  isGenerating: boolean;
  hasSelection: boolean;
};

export function resolvePlannerStage({
  draftsCount,
  scheduledCount,
  isGenerating,
  hasSelection,
}: ResolvePlannerStageInput): PlannerStage {
  if (isGenerating) return 'generate';
  if (hasSelection) return 'review';
  if (scheduledCount > 0) return 'schedule';
  if (draftsCount > 0) return 'review';
  return 'plan';
}

export function PlannerWorkflowRail({
  currentStage,
  insight,
}: {
  currentStage: PlannerStage;
  insight?: string;
}) {
  const currentIndex = STAGES.findIndex((stage) => stage.id === currentStage);

  return (
    <nav
      aria-label="Content workflow"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
    >
      {/* No min-w-0 on the list or its items: squeezed below their content, a stage's label
          ran under the next stage's number. The insight note wraps instead. */}
      <ol className="flex flex-1 items-center">
        {STAGES.map((stage, index) => {
          const complete = index < currentIndex;
          const current = stage.id === currentStage;
          return (
            <li key={stage.id} className="flex flex-1 items-center last:flex-none">
              <span
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 text-xs font-medium',
                  current && 'text-foreground',
                  complete && 'text-primary',
                  !current && !complete && 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'inline-flex size-5 items-center justify-center rounded-full border font-mono text-2xs',
                    current && 'border-primary bg-primary/10 text-primary',
                    complete && 'border-primary bg-primary text-primary-foreground',
                    !current && !complete && 'border-border bg-background',
                  )}
                >
                  {complete ? <Check aria-hidden="true" /> : index + 1}
                </span>
                {/* Phones only have room for the current stage's label; the rest stay readable to screen readers. */}
                <span className={cn(!current && 'max-sm:sr-only')}>{stage.label}</span>
              </span>
              {index < STAGES.length - 1 ? (
                <span className="mx-2 h-px min-w-3 flex-1 bg-border" aria-hidden="true" />
              ) : null}
            </li>
          );
        })}
      </ol>
      {insight ? (
        <div
          role="note"
          aria-label="Planning insight"
          className="flex max-w-lg items-start gap-1.5 border-border text-xs leading-snug text-muted-foreground max-sm:basis-full sm:border-l sm:pl-3"
        >
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span>{insight}</span>
        </div>
      ) : null}
    </nav>
  );
}
