import { CalendarIcon, ClockIcon, GlobeIcon, ReaderIcon } from '@radix-ui/react-icons';

import { Pill } from '@/components/kibo-ui/pill';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Separator } from '@/components/ui/separator';
import type { BrandInsightsQuestionsByNiche } from '@/lib/schemas/brandInsights';
import { BrandQuestionsList } from './BrandQuestionsList';

type BrandQuestionsPanelProps = {
  questionsByNiche: BrandInsightsQuestionsByNiche;
  country?: string;
  weekStartDate?: string;
  generatedAt?: string;
  status?: string;
};

function formatDate(value?: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function countQuestions(questionsByNiche: BrandInsightsQuestionsByNiche) {
  return Object.values(questionsByNiche.questionsByNiche ?? {}).reduce((total, niche) => {
    return total + (niche.questions?.length ?? 0);
  }, 0);
}

export function BrandQuestionsPanel({
  questionsByNiche,
  country,
  weekStartDate,
  generatedAt,
  status,
}: BrandQuestionsPanelProps) {
  const weekLabel = formatDate(weekStartDate);
  const generatedLabel = formatDate(generatedAt ?? questionsByNiche.generatedAt);
  const panelStatus = status ?? questionsByNiche.status;
  const totalQuestions =
    questionsByNiche.summary?.totalQuestions ?? countQuestions(questionsByNiche);

  return (
    <GlassPanel className="p-[var(--card-pad)] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ReaderIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">Brand Insights · Questions</span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">Audience questions</h3>
          <span className="block text-sm text-muted-foreground">
            Common questions and prompts surfaced from your niche and social data.
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {typeof totalQuestions === 'number' && totalQuestions > 0 && (
            <Pill variant="teal">{totalQuestions} questions</Pill>
          )}
          {country && (
            <Pill variant="muted">
              <GlobeIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {country}
            </Pill>
          )}
          {weekLabel && (
            <Pill variant="violet">
              <CalendarIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Week of {weekLabel}
            </Pill>
          )}
          {generatedLabel && (
            <Pill variant="success">
              <ClockIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Updated {generatedLabel}
            </Pill>
          )}
          {panelStatus && <Pill variant="warning">{panelStatus}</Pill>}
        </div>
      </div>

      <Separator />

      <BrandQuestionsList questionsByNiche={questionsByNiche.questionsByNiche} />
    </GlassPanel>
  );
}
