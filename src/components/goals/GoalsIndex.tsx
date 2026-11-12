'use client';

import { ArrowRight, FileText, Target } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { PageHeader } from '@/components/shared/PageHeader';
import { Link } from '@/i18n/navigation';
import type { GoalSummaryView } from '@/lib/goals/models';
import { formatRelativeTime } from '@/lib/time/relativeTime';
import { CreateCampaignGoalDialog } from './CreateCampaignGoalDialog';
import { GoalStatusPill } from './GoalStatusPill';

type GoalsIndexProps = {
  brandId: string;
  brandName: string;
  goals: GoalSummaryView[];
};

export function GoalsIndex({ brandId, brandName, goals }: GoalsIndexProps) {
  const uiLocale = useLocale();

  const uiText = useTranslations('dashboard');
  return (
    <div className="flex h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] min-w-0 flex-col gap-[var(--app-shell-gap)] py-[var(--page-pad-block)]">
      <PageHeader
        title={uiText('goals_116cd39')}
        description={uiText('m_6c257227b1', { v0: String(brandName) })}
        action={<CreateCampaignGoalDialog brandId={brandId} />}
      />

      <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border/70 bg-background/35">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 px-4 py-2">
          <p className="font-mono text-2xs uppercase tracking-wide text-muted-foreground">
            {uiText('active_case_files_dce0ce3')}
          </p>
          <p className="font-mono text-2xs text-muted-foreground">
            {uiText.rich('sentence_bf8f019b2190', { v0: () => goals.length })}
          </p>
        </header>

        {goals.length === 0 ? (
          <div className="flex h-full min-h-72 items-center justify-center p-6">
            <div className="max-w-md text-center">
              <Target className="mx-auto size-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">
                {uiText('create_the_campaign_checklist_2dab87d')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {uiText('define_the_outcome_and_completion_criteria_he_c3615bf')}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 overflow-y-auto">
            <ul className="divide-y divide-border/60">
              {goals.map((goal) => (
                <li key={goal.id}>
                  <Link
                    href={`/goals/${encodeURIComponent(goal.id)}`}
                    className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-4 outline-none transition-colors hover:bg-muted/35 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="mt-0.5 flex size-7 items-center justify-center rounded-md border border-border bg-card text-muted-foreground group-hover:text-primary">
                      <FileText className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{goal.title}</span>
                        <GoalStatusPill status={goal.status} />
                      </span>
                      <span className="mt-1 block max-w-3xl text-xs leading-5 text-muted-foreground">
                        {goal.outcome}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs text-muted-foreground">
                        <span>
                          {uiText.rich('sentence_276f42ea8b0e', {
                            v0: () => goal.acceptedArtifactCount,
                            v1: () => goal.artifactCount,
                          })}
                        </span>
                        {goal.pendingInputCount > 0 ? (
                          <span>
                            {uiText.rich('sentence_cdbb1cb17d56', {
                              count: goal.pendingInputCount,
                            })}
                          </span>
                        ) : null}
                        <span>
                          {goal.accountableHumanName
                            ? uiText('m_baf6632593', { v0: String(goal.accountableHumanName) })
                            : uiText('lead_unassigned_6ffe181')}
                        </span>
                        <span>
                          {uiText.rich('sentence_5f1f7fcaedd2', {
                            v0: () => formatRelativeTime(goal.updatedAt, Date.now(), uiLocale),
                          })}
                        </span>
                      </span>
                    </span>
                    <ArrowRight className="mt-1 size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
