// A cost in a table cell, coloured against its thresholds: a green or red chip at the ends,
// plain figure in between (docs/05). A missing cost says why in words.

import type { EasyfitChipThreshold } from '@continuum/contracts';
import { formatMxn } from '../dashboardFormat';
import { costTone } from '../dashboardModel';
import { useDashboardLocale } from '../i18n/useDashboardLocale';
import { StatusChip } from './StatusChip';

export function CostChip({
  value,
  threshold,
  emptyLabel,
}: {
  value: number | null;
  threshold: EasyfitChipThreshold;
  emptyLabel: string;
}) {
  const locale = useDashboardLocale();
  if (value == null) return <span className="text-muted-foreground">{emptyLabel}</span>;
  const tone = costTone(value, threshold);
  const text = formatMxn(value, locale);
  if (tone === 'neutral') return <span>{text}</span>;
  return <StatusChip tone={tone}>{text}</StatusChip>;
}
