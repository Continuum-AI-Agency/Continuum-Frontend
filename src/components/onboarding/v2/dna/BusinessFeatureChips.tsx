import { useTranslations } from 'next-intl';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AgentPreviewBuckets } from '../state/agentPreview';
import { ChipRow } from './listprimitives';

type Props = {
  business: NonNullable<AgentPreviewBuckets['business']>;
};

export function BusinessFeatureChips({ business }: Props) {
  const tUi = useTranslations('onboarding');

  const competitors = business.competitor_names ?? [];
  const features = business.business_features ?? [];
  const benefits = business.business_benefits ?? [];
  if (competitors.length === 0 && features.length === 0 && benefits.length === 0) return null;
  return (
    <ScrollArea className="h-28">
      <div className="space-y-2 pr-3 pt-2">
        {competitors.length > 0 ? (
          <ChipRow label={tUi('m_855bd26cf4')} values={competitors} variant="violet" />
        ) : null}
        {features.length > 0 ? (
          <ChipRow label={tUi('m_fc338f87a0')} values={features} variant="violet" />
        ) : null}
        {benefits.length > 0 ? (
          <ChipRow label={tUi('m_927f406737')} values={benefits} variant="teal" />
        ) : null}
      </div>
    </ScrollArea>
  );
}
