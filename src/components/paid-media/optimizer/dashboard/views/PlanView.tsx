// Plan: the ordered actions Continuum writes in the pilot config, each tagged, and how the
// module updates itself (docs/05 §9). The action texts are config data and keep the language
// they were written in.

import type { EasyfitPilotConfig } from '@continuum/contracts';
import { useDashboardCopy } from '../i18n/useDashboardLocale';
import { Block, Note, ViewGrid, ViewLead } from '../parts/layout';
import { StatusChip } from '../parts/StatusChip';

export function PlanView({ plan }: { plan: EasyfitPilotConfig['plan'] | null }) {
  const { t } = useDashboardCopy();
  const actions = plan ?? [];

  return (
    <ViewGrid>
      <ViewLead title={t.plan.lead}>{t.plan.leadBody}</ViewLead>
      <Block span="wide">
        {actions.length === 0 ? (
          <Note>{t.plan.empty}</Note>
        ) : (
          <ol className="m-0 list-none space-y-2 p-0" data-testid="plan-actions">
            {actions.map((action, index) => (
              <li
                className="flex items-start justify-between gap-3 border-border/60 border-b pb-2 last:border-0"
                key={`${index}-${action.titulo}`}
              >
                <div className="flex min-w-0 gap-3">
                  <span className="font-mono text-sm text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <b className="block text-sm">{action.titulo}</b>
                    <p className="m-0 text-xs text-muted-foreground">{action.cuerpo}</p>
                  </div>
                </div>
                <StatusChip tone="neutral">{t.plan.category[action.etiqueta]}</StatusChip>
              </li>
            ))}
          </ol>
        )}
      </Block>
      <Block span="narrow" subtitle={t.plan.flowSub} title={t.plan.flowTitle}>
        <ol className="m-0 list-none space-y-2 p-0">
          {t.plan.flow.map((step) => (
            <li className="rounded-lg border border-border/60 p-3" key={step.key}>
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {step.key}
              </span>
              <b className="block text-sm">{step.title}</b>
              <p className="m-0 text-xs text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </Block>
    </ViewGrid>
  );
}
