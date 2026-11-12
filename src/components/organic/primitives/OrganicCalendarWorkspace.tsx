import { plannerDayIdInZone } from '@continuum/contracts';
import { useLocale, useTranslations } from 'next-intl';
import type { CalendarPostAccountsByPlatform } from '@/lib/organic/calendar-posts';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { PlannerAccountOption } from '@/lib/organic/store';
import type { Trend } from '@/lib/organic/trends';
import { buildWeekDays } from './calendar-utils';
import { OrganicCalendarWorkspaceClient } from './OrganicCalendarWorkspaceClient';
import { resolvePlannerInitialDates } from './planner-date-anchor';
import type {
  OrganicCalendarDay,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicTrendType,
} from './types';

type OrganicCalendarWorkspaceProps = {
  trendTypes?: OrganicTrendType[];
  trends?: Trend[];
  activePlatforms?: OrganicPlatformKey[];
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>;
  platformAccountOptions?: Partial<Record<OrganicPlatformKey, PlannerAccountOption[]>>;
  maxTrendSelections?: number;
  brandProfileId?: string;
  brandName?: string;
  brandTimeZone?: string;
  userId?: string;
  initialWeekStart?: string | null;
  initialSelectedDraftId?: string | null;
  initialView?: 'week' | 'month' | 'list';
  initialComposeTrendId?: string | null;
  initialComposePlatform?: OrganicPlatformKey | null;
  postedContentAccountsByPlatform?: CalendarPostAccountsByPlatform;
  /** Why the server-side trend fetch failed, when it did — the Trends drawer says so. */
  insightsError?: string | null;
};

export function OrganicCalendarWorkspace({
  trendTypes = [],
  trends,
  activePlatforms,
  platformAccountIds,
  platformAccountOptions,
  maxTrendSelections,
  brandProfileId,
  brandName,
  brandTimeZone,
  userId,
  initialWeekStart,
  initialSelectedDraftId,
  initialView,
  initialComposeTrendId,
  initialComposePlatform,
  postedContentAccountsByPlatform,
  insightsError,
}: OrganicCalendarWorkspaceProps) {
  const uiText = useTranslations('organic');
  const uiLocale = useLocale();
  const defaultCreationSteps: OrganicCreationStep[] = [
    {
      id: 'trends',
      title: uiText('review_trends_02239ed'),
      detail: uiText('select_high_signal_topics_fe31483'),
      status: 'active',
    },
    {
      id: 'competitors',
      title: uiText('competitor_analysis_6411403'),
      detail: uiText('scanning_recent_top_posts_9d90c93'),
      status: 'upcoming',
    },
    {
      id: 'agent',
      title: uiText('agent_drafting_f5ddf8f'),
      detail: uiText('generating_content_variants_61f120b'),
      status: 'upcoming',
    },
    {
      id: 'composer',
      title: uiText('review_refine_86e6ad1'),
      detail: uiText('polish_drafts_for_scheduling_73eeee7'),
      status: 'upcoming',
    },
  ];
  const defaultEditorSlides: OrganicEditorSlide[] = [
    {
      id: 'slide-1',
      label: uiText('hook_536ff50'),
      gradient: 'from-purple-500/20 to-blue-500/20',
    },
    {
      id: 'slide-2',
      label: uiText('value_8e37953'),
      gradient: 'from-blue-500/20 to-cyan-500/20',
    },
    {
      id: 'slide-3',
      label: uiText('example_d029f87'),
      gradient: 'from-cyan-500/20 to-emerald-500/20',
    },
    {
      id: 'slide-4',
      label: uiText('cta_0206201'),
      gradient: 'from-emerald-500/20 to-lime-500/20',
    },
  ];

  const todayId = plannerDayIdInZone(new Date().toISOString(), brandTimeZone);
  const { weekStart: resolvedWeekStart } = resolvePlannerInitialDates({
    initialWeekStart: initialWeekStart ?? undefined,
    now: todayId ? new Date(`${todayId}T12:00:00`) : undefined,
  });
  const days = buildWeekDays(resolvedWeekStart, uiLocale);

  return (
    <OrganicCalendarWorkspaceClient
      days={days}
      initialWeekStart={initialWeekStart ?? undefined}
      initialSelectedDraftId={initialSelectedDraftId}
      steps={defaultCreationSteps}
      editorSlides={defaultEditorSlides}
      trendTypes={trendTypes}
      trends={trends}
      activePlatforms={activePlatforms}
      platformAccountIds={platformAccountIds}
      platformAccountOptions={platformAccountOptions}
      maxTrendSelections={maxTrendSelections}
      brandProfileId={brandProfileId}
      brandName={brandName}
      brandTimeZone={brandTimeZone}
      userId={userId}
      initialView={initialView}
      initialComposeTrendId={initialComposeTrendId}
      initialComposePlatform={initialComposePlatform}
      postedContentAccountsByPlatform={postedContentAccountsByPlatform}
      insightsError={insightsError}
    />
  );
}
