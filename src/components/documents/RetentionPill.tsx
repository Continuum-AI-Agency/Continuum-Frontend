'use client';
import {useLocale} from 'next-intl';


import { useTranslations } from 'next-intl';

import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import type { DocumentView } from './types';
import { formatRetentionCountdown, isArchived, isEphemeral } from './types';

// Renders ONLY for non-default lifecycle states. A permanent, live document — the
// overwhelming majority — gets no pill at all, so the list stays quiet and the badge
// actually means something when it appears.
export function RetentionPill({ doc, now }: { doc: DocumentView; now: number }) {
const uiLocale=useLocale();

  const uiText = useTranslations('common');
  if (isArchived(doc)) {
    return (
      <Pill variant="secondary" className="shrink-0 text-xs">
        {uiText('archived_bdb8650')}
      </Pill>
    );
  }

  if (!isEphemeral(doc)) return null;

  const countdown = formatRetentionCountdown(doc.expiresAt, now,uiText,uiLocale);
  return (
    <Pill variant="outline" className="shrink-0 gap-1 text-xs">
      <PillIndicator variant="warning" />
      {countdown ? uiText('m_571136120d', { v0: String(countdown) }) : uiText('m_33d5667cd5')}
    </Pill>
  );
}
