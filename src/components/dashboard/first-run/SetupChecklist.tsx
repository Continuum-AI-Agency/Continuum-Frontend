import { useTranslations as useBetaTranslations, useTranslations } from 'next-intl';
import { localizeDashboardCopy } from '@/i18n/dashboardCopy';
// Guided setup checklist (IMP-001) with in-context "Connect / Assign" CTAs
// (IMP-003). Tracked steps (connect / assign / brand book) show a done/todo
// state; guidance-only steps render as open action items. Each row jumps to the
// surface where the user can act — it never rebuilds an assignment path, it
// links into the existing one.

import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import type { DashboardSetupState, DashboardSetupStep } from './setupState';

function StepIcon({ status }: { status: DashboardSetupStep['status'] }) {
  if (status === 'done') {
    return <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-500" />;
  }
  return <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />;
}

function ChecklistRow({ step }: { step: DashboardSetupStep }) {
  const uiText = useTranslations('dashboard');
  const isDone = step.status === 'done';
  return (
    <li className="flex items-start gap-3 py-2.5">
      <StepIcon status={step.status} />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm font-medium',
            isDone ? 'text-muted-foreground line-through' : 'text-foreground',
          )}
        >
          {localizeDashboardCopy(step.label, uiText)}
        </p>
        <p className="text-xs text-muted-foreground">
          {localizeDashboardCopy(step.description, uiText)}
        </p>
      </div>
      <Link
        href={step.href}
        data-testid={`setup-step-cta-${step.id}`}
        className={cn(
          buttonVariants({ size: 'xs', variant: isDone ? 'ghost' : 'outline' }),
          'shrink-0',
        )}
      >
        {localizeDashboardCopy(step.cta, uiText)}
        <ArrowRight aria-hidden="true" className="size-3" />
      </Link>
    </li>
  );
}

export function SetupChecklist({ setup }: { setup: DashboardSetupState }) {
  const uiText = useTranslations('dashboard');

  const betaUiText = useBetaTranslations('dashboard');

  // The count heads the steps it counts. The guidance steps are never counted (nothing records
  // them as done), so under the same count and checkbox "2 of 3 done" headed five steps
  // (PP-DT-C-setup-checklist-2-of-3-over-5-steps): they are set apart as optional.
  const tracked = setup.steps.filter((step) => step.tracked);
  const optional = setup.steps.filter((step) => !step.tracked);
  return (
    <section
      aria-label={uiText('guided_setup_checklist_c747add')}
      data-testid="dashboard-setup-checklist"
      className="p-[var(--card-pad)]"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {uiText('finish_setting_up_51eb40d')}
        </h2>
        <span className="tabular-nums text-xs text-muted-foreground">
          {uiText.rich('sentence_90e213d1e91e', {
            v0: () => setup.completedCount,
            v1: () => setup.trackedCount,
          })}
        </span>
      </header>
      <ul className="mt-2 divide-y divide-border/60" data-testid="setup-tracked-steps">
        {tracked.map((step) => (
          <ChecklistRow key={step.id} step={step} />
        ))}
      </ul>
      {optional.length > 0 ? (
        <div className="mt-3" data-testid="setup-optional-steps">
          <h3 className="text-xs font-medium text-muted-foreground">
            {betaUiText('beta_1d63314c2381')}
          </h3>
          <ul className="mt-1 divide-y divide-border/60">
            {optional.map((step) => (
              <ChecklistRow key={step.id} step={step} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
