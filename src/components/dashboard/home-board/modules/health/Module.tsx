'use client';

// The expanded doctor: every check in three groups — what needs fixing (each with its fix), what
// passes, and what Continuum cannot read yet (never counted as passing).

import { useTranslations } from 'next-intl';
import { CheckIcon, FixLink } from './DoctorParts';
import type { DoctorCheck, DoctorCheckStatus, DoctorView } from './doctorModel';

type ReadyView = Extract<DoctorView, { state: 'ready' }>;

const GROUPS = [
  { status: 'fail', title: 'needs_fixing_3cd915e' },
  { status: 'pass', title: 'passing_83e6fba' },
  { status: 'unreadable', title: 'not_readable_yet_0a48a0f' },
] as const satisfies readonly { status: Exclude<DoctorCheckStatus, 'loading'>; title: string }[];

function CheckRow({ check }: { check: DoctorCheck }) {
  return (
    <li
      className="flex min-w-0 items-start gap-3 py-2.5"
      data-check={check.id}
      data-hygiene={check.hygiene}
      data-status={check.status}
      data-testid="home-health-check"
    >
      <CheckIcon status={check.status} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-sm">{check.label}</p>
        {check.detail ? <p className="text-muted-foreground text-xs">{check.detail}</p> : null}
        {check.examples && check.examples.length > 0 ? (
          <ul className="mt-1 space-y-0.5" data-testid="home-health-examples">
            {check.examples.map((example) => (
              <li className="break-words text-2xs text-muted-foreground" key={example.id}>
                <span className="font-medium text-foreground">{example.name ?? example.id}</span>:{' '}
                {example.detail}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {check.fix ? <FixLink fix={check.fix} /> : null}
    </li>
  );
}

export default function HealthModule({ view }: { view: ReadyView }) {
  const uiText = useTranslations('dashboard');
  return (
    <div className="space-y-5" data-testid="home-health-module">
      <p className="text-muted-foreground text-sm">
        {view.failing > 0
          ? uiText('passing_of_total_readable_checks_pass_failing_7514a7a', {
              passing: view.passing,
              total: view.total,
              failing: view.failing,
            })
          : uiText('passing_of_total_readable_checks_pass_2702dae', {
              passing: view.passing,
              total: view.total,
            })}
      </p>
      {GROUPS.map((group) => {
        const checks = view.checks.filter((check) => check.status === group.status);
        if (checks.length === 0) return null;
        return (
          <section
            aria-label={uiText(group.title)}
            data-testid={`home-health-group-${group.status}`}
            key={group.status}
          >
            <h4 className="font-medium text-sm">
              {uiText(group.title)} <span className="text-muted-foreground">· {checks.length}</span>
            </h4>
            <ul
              className="hit-area-column divide-y divide-border/60"
              data-testid="home-health-list"
            >
              {checks.map((check) => (
                <CheckRow check={check} key={check.id} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
