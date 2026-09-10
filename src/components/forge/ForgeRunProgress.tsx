'use client';

import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, PauseCircle } from 'lucide-react';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Progress } from '@/components/ui/progress';
import type { TemplateRunRow } from '@/lib/library/templateSources';

/**
 * The three flags, shown as three facts.
 *
 * `done` means the engine stopped advancing the run ITSELF — which includes `needs_input`, where
 * it is waiting for a person, and `failed`. It is not a success signal; `ok` is, and it is null
 * while working. A single "status" badge would have to pick one of these and would necessarily
 * lie about a run that is parked, unfinished, and waiting on you.
 */
function verdict(run: TemplateRunRow): {
  tone: 'success' | 'error' | 'warning' | 'info';
  label: string;
  Icon: typeof Loader2;
  spin?: boolean;
} {
  if (run.state === 'failed') return { tone: 'error', label: 'Failed', Icon: AlertTriangle };
  // `warning` and not `error`: nothing has gone wrong, the run is waiting for a person. Colouring
  // it red would make an ordinary step of the flow read as a fault.
  if (run.state === 'needs_input') {
    return { tone: 'warning', label: 'Needs your answer', Icon: PauseCircle };
  }
  if (run.state === 'published') return { tone: 'success', label: 'Published', Icon: CheckCircle2 };
  if (run.done) {
    // draft_ready / review_ready: finished a stage cleanly and is waiting to be moved on.
    return { tone: 'info', label: labelForState(run.state), Icon: CheckCircle2 };
  }
  return { tone: 'info', label: labelForState(run.state), Icon: Loader2, spin: true };
}

const STATE_LABELS: Record<string, string> = {
  created: 'Queued',
  analyzing: 'Reading the project',
  mapping: 'Matching slots to fields',
  building: 'Building the spec',
  validating: 'Checking it',
  draft_ready: 'Draft ready',
  needs_input: 'Needs your answer',
  smoking: 'Test render',
  review_ready: 'Ready to review',
  promoting: 'Publishing',
  published: 'Published',
  failed: 'Failed',
};

function labelForState(state: string): string {
  return STATE_LABELS[state] ?? state;
}

const PHASE_LABELS: Record<string, string> = {
  analyze: 'Read the file',
  derive: 'Work out the columns',
  provision: 'Build its home',
  seed: 'Seed row 1',
  load: 'Load alternates',
  build: 'Assemble the spec',
  validate: 'Validate',
};

export function ForgeRunProgress({ run }: { run: TemplateRunRow }) {
  const { tone, label, Icon, spin } = verdict(run);
  const pct = run.progress?.pct ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>
          <PillIndicator variant={tone} pulse={spin} />
          <Icon className={`size-3.5 ${spin ? 'animate-spin' : ''}`} aria-hidden />
          {label}
        </Pill>
        {run.root_table ? (
          <span className="font-mono text-xs text-muted-foreground">{run.root_table}</span>
        ) : null}
      </div>

      {/*
        pct === null is INDETERMINATE, not 0%.

        Nobody can know how many columns an AEP implies until its Essential Graphics have been
        read, so the forge reports a null total until then. A bar sitting at 0 and a bar that does
        not know yet are different facts, and drawing both as an empty track is exactly how a
        wedged run looks healthy.
      */}
      {pct === null ? (
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-secondary"
          role="progressbar"
          aria-label="Reading the project"
          aria-valuetext="Working out how much there is to do"
        >
          <div className="h-full w-1/3 animate-[forge-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:animate-none motion-reduce:w-full motion-reduce:opacity-60" />
        </div>
      ) : (
        <Progress value={pct} aria-label={`${label}, ${pct}% done`} />
      )}

      <p className="text-xs text-muted-foreground">
        {run.progress?.detail ??
          (pct === null ? 'Working out how much there is to do…' : labelForState(run.state))}
      </p>

      {run.progress?.phases?.length ? (
        <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {run.progress.phases.map((phase) => {
            // A phase sized 0 had nothing to do — it is not "done", and calling it done would
            // let pct:100 mean "a step was skipped quietly".
            const empty = phase.total === 0;
            const complete = phase.total !== null && phase.total > 0 && phase.done >= phase.total;
            return (
              <li key={phase.name} className="flex items-center gap-1">
                {complete ? (
                  <CheckCircle2 className="size-3 text-emerald-500" aria-hidden />
                ) : (
                  <CircleDashed className="size-3" aria-hidden />
                )}
                <span className={complete ? 'text-foreground' : undefined}>
                  {PHASE_LABELS[phase.name] ?? phase.name}
                </span>
                <span className="tabular-nums">
                  {empty ? '—' : phase.total === null ? '?' : `${phase.done}/${phase.total}`}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {run.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="font-mono">{run.error.code}</span>
          {run.error.message ? ` — ${run.error.message}` : null}
        </p>
      ) : null}

      {run.findings?.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {run.findings.length} thing{run.findings.length === 1 ? '' : 's'} the run could not do
          </summary>
          <ul className="mt-2 space-y-1">
            {run.findings.map((finding) => (
              <li key={finding.code} className="text-muted-foreground">
                <span className="font-mono text-foreground">{finding.code}</span>
                {finding.why ? ` — ${finding.why}` : null}
                {/*
                  A null resolver is the backlog: nothing can fix this class of problem yet.
                  Saying so is the point — "we can fix this for you" and "nobody can fix this
                  yet" are different answers and a finding list that blurs them is noise.
                */}
                {finding.resolver === null ? (
                  <span className="ml-1 italic">(no fix exists yet)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
