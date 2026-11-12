'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The expanded doctor: every check in three groups — what needs fixing (each with its fix), what
// passes, and what Continuum cannot read yet (never counted as passing).

import { CheckIcon, FixLink } from './DoctorParts';
import type { DoctorCheck, DoctorCheckStatus, DoctorView } from './doctorModel';

type ReadyView = Extract<DoctorView, { state: 'ready' }>;

const GROUPS: {
  status: Exclude<DoctorCheckStatus, 'loading'>;
  title: string;
}[] = [
  { status: 'fail', title: 'Needs fixing' },
  { status: 'pass', title: 'Passing' },
  { status: 'unreadable', title: 'Not readable yet' },
];

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
  const betaUiText = useBetaTranslations('dashboard');

  return (
    <div className="space-y-5" data-testid="home-health-module">
      <p className="text-muted-foreground text-sm">
        {view.passing} {betaUiText('beta_28391d3bc64e')} {view.total}{' '}
        {betaUiText('beta_460b5f1eb2c5')}
        {view.failing > 0 ? betaUiText('beta_8bdf57c93de1', { value0: String(view.failing) }) : ''}.
      </p>
      {GROUPS.map((group) => {
        const checks = view.checks.filter((check) => check.status === group.status);
        if (checks.length === 0) return null;
        return (
          <section
            aria-label={group.title}
            data-testid={`home-health-group-${group.status}`}
            key={group.status}
          >
            <h4 className="font-medium text-sm">
              {group.title} <span className="text-muted-foreground">· {checks.length}</span>
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
