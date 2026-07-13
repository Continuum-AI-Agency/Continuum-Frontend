import type { CalendarPostAccountsByPlatform } from '@/lib/organic/calendar-posts';
import type { OrganicPlatformKey } from '@/lib/organic/platforms';
import type { PlannerAccountOption } from '@/lib/organic/store';
import type { Trend } from '@/lib/organic/trends';
import { buildWeekDays, startOfWeek } from './calendar-utils';
import { OrganicCalendarWorkspaceClient } from './OrganicCalendarWorkspaceClient';
import type {
  OrganicCalendarDay,
  OrganicCreationStep,
  OrganicEditorSlide,
  OrganicTrendType,
} from './types';

const defaultCreationSteps: OrganicCreationStep[] = [
  {
    id: 'trends',
    title: 'Review trends',
    detail: 'Select high-signal topics',
    status: 'active',
  },
  {
    id: 'competitors',
    title: 'Competitor analysis',
    detail: 'Scanning recent top posts...',
    status: 'upcoming',
  },
  {
    id: 'agent',
    title: 'Agent drafting',
    detail: 'Generating content variants...',
    status: 'upcoming',
  },
  {
    id: 'composer',
    title: 'Review & Refine',
    detail: 'Polish drafts for scheduling',
    status: 'upcoming',
  },
];

const defaultEditorSlides: OrganicEditorSlide[] = [
  { id: 'slide-1', label: 'Hook', gradient: 'from-purple-500/20 to-blue-500/20' },
  { id: 'slide-2', label: 'Value', gradient: 'from-blue-500/20 to-cyan-500/20' },
  { id: 'slide-3', label: 'Example', gradient: 'from-cyan-500/20 to-emerald-500/20' },
  { id: 'slide-4', label: 'CTA', gradient: 'from-emerald-500/20 to-lime-500/20' },
];

type OrganicCalendarWorkspaceProps = {
  trendTypes?: OrganicTrendType[];
  trends?: Trend[];
  activePlatforms?: OrganicPlatformKey[];
  platformAccountIds?: Partial<Record<OrganicPlatformKey, string>>;
  platformAccountOptions?: Partial<Record<OrganicPlatformKey, PlannerAccountOption[]>>;
  maxTrendSelections?: number;
  brandProfileId?: string;
  brandName?: string;
  userId?: string;
  instagramAccountId?: string;
  initialWeekStart?: string | null;
  initialSelectedDraftId?: string | null;
  initialView?: 'week' | 'month' | 'list';
  postedContentAccountsByPlatform?: CalendarPostAccountsByPlatform;
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
  userId,
  instagramAccountId,
  initialWeekStart,
  initialSelectedDraftId,
  initialView,
  postedContentAccountsByPlatform,
}: OrganicCalendarWorkspaceProps) {
  const resolvedWeekStart =
    initialWeekStart && !Number.isNaN(new Date(initialWeekStart).getTime())
      ? startOfWeek(new Date(initialWeekStart))
      : startOfWeek(new Date());
  const days = buildWeekDays(resolvedWeekStart);

  return (
    <OrganicCalendarWorkspaceClient
      days={days}
      initialWeekStart={resolvedWeekStart.toISOString()}
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
      userId={userId}
      instagramAccountId={instagramAccountId}
      initialView={initialView}
      postedContentAccountsByPlatform={postedContentAccountsByPlatform}
    />
  );
}
