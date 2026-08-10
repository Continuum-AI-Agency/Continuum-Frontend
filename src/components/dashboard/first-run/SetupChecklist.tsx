// Guided setup checklist (IMP-001) with in-context "Connect / Assign" CTAs
// (IMP-003). Tracked steps (connect / assign / brand book) show a done/todo
// state; guidance-only steps render as open action items. Each row jumps to the
// surface where the user can act — it never rebuilds an assignment path, it
// links into the existing one.

import { ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DashboardSetupState, DashboardSetupStep } from './setupState';

function StepIcon({ status }: { status: DashboardSetupStep['status'] }) {
  if (status === 'done') {
    return <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-500" />;
  }
  return <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />;
}

function ChecklistRow({ step }: { step: DashboardSetupStep }) {
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
          {step.label}
        </p>
        <p className="text-xs text-muted-foreground">{step.description}</p>
      </div>
      <Link
        href={step.href}
        data-testid={`setup-step-cta-${step.id}`}
        className={cn(
          buttonVariants({ size: 'xs', variant: isDone ? 'ghost' : 'outline' }),
          'shrink-0',
        )}
      >
        {step.cta}
        <ArrowRight aria-hidden="true" className="size-3" />
      </Link>
    </li>
  );
}

export function SetupChecklist({ setup }: { setup: DashboardSetupState }) {
  return (
    <section
      aria-label="Guided setup checklist"
      data-testid="dashboard-setup-checklist"
      className="p-[var(--card-pad)]"
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Finish setting up</h2>
        <span className="tabular-nums text-xs text-muted-foreground">
          {setup.completedCount} of {setup.trackedCount} done
        </span>
      </header>
      <ul className="mt-2 divide-y divide-border/60">
        {setup.steps.map((step) => (
          <ChecklistRow key={step.id} step={step} />
        ))}
      </ul>
    </section>
  );
}
