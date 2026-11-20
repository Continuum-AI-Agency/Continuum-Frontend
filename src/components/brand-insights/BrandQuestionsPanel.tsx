import { BookOpen, Calendar, Clock, Globe } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

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

function formatDate(value: string | undefined, uiLocale: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toLocaleDateString(uiLocale, {
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
  const tUi = useTranslations('common');
  const uiLocale = useLocale();

  const weekLabel = formatDate(weekStartDate, uiLocale);
  const generatedLabel = formatDate(generatedAt ?? questionsByNiche.generatedAt, uiLocale);
  const panelStatus = status ?? questionsByNiche.status;
  const totalQuestions =
    questionsByNiche.summary?.totalQuestions ?? countQuestions(questionsByNiche);

  return (
    <GlassPanel className="p-[var(--card-pad)] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className="text-xs text-muted-foreground">{tUi('m_a53ffb6b28')}</span>
          </div>
          <h3 className="text-xl font-semibold text-foreground">{tUi('m_2c7d43a49d')}</h3>
          <span className="block text-sm text-muted-foreground">{tUi('m_d938c8f8f8')}</span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {typeof totalQuestions === 'number' && totalQuestions > 0 && (
            <Pill variant="teal">
              {totalQuestions}
              {tUi('m_5389308aaa')}
            </Pill>
          )}
          {country && (
            <Pill variant="muted">
              <Globe className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {country}
            </Pill>
          )}
          {weekLabel && (
            <Pill variant="violet">
              <Calendar className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {tUi('m_7f262e0a5d')}
              {weekLabel}
            </Pill>
          )}
          {generatedLabel && (
            <Pill variant="success">
              <Clock className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {tUi('m_c95815a044')}
              {generatedLabel}
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
