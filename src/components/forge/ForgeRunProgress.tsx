'use client';

import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, PauseCircle } from 'lucide-react';
import { type useTranslations, useTranslations as useUiTranslations } from 'next-intl';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { Progress } from '@/components/ui/progress';
import type { TemplateRunRow } from '@/lib/library/templateSources';
import { templateStateLabel } from './templateCheckPresentation';

/**
 * The three flags, shown as three facts.
 *
 * `done` means the engine stopped advancing the run ITSELF — which includes `needs_input`, where
 * it is waiting for a person, and `failed`. It is not a success signal; `ok` is, and it is null
 * while working. A single "status" badge would have to pick one of these and would necessarily
 * lie about a run that is parked, unfinished, and waiting on you.
 */
function verdict(
  run: TemplateRunRow,
  translate: ReturnType<typeof useTranslations<'forge'>>,
): {
  tone: 'success' | 'error' | 'warning' | 'info';
  label: string;
  Icon: typeof Loader2;
  spin?: boolean;
} {
  if (run.state === 'failed')
    return { tone: 'error', label: translate('failed_031a8f0f'), Icon: AlertTriangle };
  // `warning` and not `error`: nothing has gone wrong, the run is waiting for a person. Colouring
  // it red would make an ordinary step of the flow read as a fault.
  if (run.state === 'needs_input') {
    return { tone: 'warning', label: translate('needs_your_answer_84ec74aa'), Icon: PauseCircle };
  }
  if (run.state === 'published')
    return { tone: 'success', label: translate('published_2ef42ec2'), Icon: CheckCircle2 };
  if (run.done) {
    // draft_ready / review_ready: finished a stage cleanly and is waiting to be moved on.
    return { tone: 'info', label: templateStateLabel(run.state, translate), Icon: CheckCircle2 };
  }
  return {
    tone: 'info',
    label: templateStateLabel(run.state, translate),
    Icon: Loader2,
    spin: true,
  };
}

const PHASE_KEYS = {
  analyze: 'read_your_file_ce9f3a54',
  derive: 'find_the_variables_5e9fe8da',
  provision: 'create_the_template_680f5241',
  seed: 'add_a_sample_row_3c289280',
  load: 'load_alternate_options_418d26f0',
  build: 'put_it_together_e490f15d',
  validate: 'check_everything_b923b60d',
} as const;

export function ForgeRunProgress({ run }: { run: TemplateRunRow }) {
  const translateUi = useUiTranslations('forge');

  const { tone, label, Icon, spin } = verdict(run, translateUi);
  const pct = run.progress?.pct ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>
          <PillIndicator variant={tone} pulse={spin} />
          <Icon className={`size-3.5 ${spin ? 'animate-spin' : ''}`} aria-hidden />
          {label}
        </Pill>
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
          aria-label={translateUi('reading_your_file_e56b35f3')}
          aria-valuetext={translateUi('working_out_how_much_there_is_to_do_ee2fd9f7')}
        >
          <div className="h-full w-1/3 animate-[forge-indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:animate-none motion-reduce:w-full motion-reduce:opacity-60" />
        </div>
      ) : (
        <Progress
          value={pct}
          aria-label={translateUi('value0_value1_done_b7c86f4b', {
            value0: String(label),
            value1: String(pct),
          })}
        />
      )}

      <p className="text-xs text-muted-foreground">
        {pct === null
          ? translateUi('working_out_how_much_there_is_to_do_7a748731')
          : templateStateLabel(run.state, translateUi)}
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
                  {translateUi(
                    PHASE_KEYS[phase.name as keyof typeof PHASE_KEYS] ?? 'templateStateUnknown',
                  )}
                </span>
                <span className="tabular-nums">
                  {empty ? '—' : phase.total === null ? '?' : `${phase.done}/${phase.total}`}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* Codes are for looking a failure up, not for reading, so they ride in the title. */}
      {run.error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          title={run.error.code}
        >
          {run.error.message ?? translateUi('setup_stopped_on_an_error_c04c8fe1')}
        </p>
      ) : null}

      {run.findings?.length ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {run.findings.length} {translateUi('thing_5de94d69')}
            {run.findings.length === 1 ? '' : 's'} {translateUi('setup_couldn_t_do_a9f106fe')}{' '}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {run.findings.map((finding) => (
              <li key={finding.code} className="text-muted-foreground" title={finding.code}>
                <span className="text-foreground">
                  {finding.what ?? finding.why ?? translateUi('something_went_wrong_ab827e3f')}
                </span>
                {finding.what && finding.why ? ` — ${finding.why}` : null}
                {/*
                  A null resolver is the backlog: nothing can fix this class of problem yet.
                  Saying so is the point — "we can fix this for you" and "nobody can fix this
                  yet" are different answers and a finding list that blurs them is noise.
                */}
                {finding.resolver === null ? (
                  <span className="ml-1 italic">
                    {translateUi('no_automatic_fix_yet_c5da8c9c')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
