import type { GapCategory } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { cn } from '@/lib/utils';
import { GAP_CATEGORY_META } from './gapPresentation';

export function GapBadge({ category }: { category: GapCategory }) {
  const uiText = useTranslations('competitor');
  const meta = GAP_CATEGORY_META[category];
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold',
        meta.className,
      )}
    >
      {localizeCompetitorCopy(meta.label, uiText)}
    </span>
  );
}
