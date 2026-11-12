'use client';

import { FileText, Loader2, Target } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useGoals } from '@/hooks/useGoals';
import { formatRelativeTime } from '@/lib/time/relativeTime';

export function JainaGoalsSidebarPanel({ brandId }: { brandId: string }) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  const query = useGoals(brandId);

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {uiText('loading_goals_1c23423')}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="m-3 rounded-md border border-dashed border-border p-3">
        <p className="text-xs font-medium">{uiText('goals_are_not_available_here_yet_7121d57')}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {uiText('this_environment_has_not_published_the_campai_a19c98c')}
        </p>
      </div>
    );
  }

  const goals = query.data ?? [];
  if (goals.length === 0) {
    return (
      <div className="m-3 rounded-md border border-dashed border-border p-4 text-center">
        <Target className="mx-auto size-4 text-muted-foreground" />
        <p className="mt-2 text-xs font-medium">{uiText('no_campaign_goals_yet_910c8b5')}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {uiText('create_one_from_this_goals_tab_to_start_its_s_1f2b208')}
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-44 md:max-h-none md:flex-1 md:min-h-0">
      <div className="flex gap-2 p-2 md:flex-col">
        {goals.map((goal) => (
          <Link
            key={goal.id}
            href={`/goals/${encodeURIComponent(goal.id)}`}
            className="flex min-w-[220px] items-start gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-left transition-colors hover:border-border hover:bg-background/70 md:min-w-0"
          >
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-primary-ink">
                {goal.title}
              </span>
              <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                {goal.outcome}
              </span>
              <span className="mt-1 block font-mono text-xs text-muted-foreground">
                {uiText.rich('sentence_5f1f7fcaedd2', {
                  v0: () => formatRelativeTime(goal.updatedAt, undefined, uiLocale),
                })}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </ScrollArea>
  );
}
