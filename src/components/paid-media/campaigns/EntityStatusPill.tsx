import { useTranslations } from 'next-intl';
import { Pill, PillIndicator } from '@/components/kibo-ui/pill';
import { cn } from '@/lib/utils';

/** "CAMPAIGN_PAUSED" → "Campaign paused". */
const STATUS_MESSAGE_KEYS = {
  ACTIVE: 'entityActive',
  PAUSED: 'entityPaused',
  ARCHIVED: 'entityArchived',
  DELETED: 'entityDeleted',
  ADSET_PAUSED: 'entityAdSetPaused',
  CAMPAIGN_PAUSED: 'entityCampaignPaused',
  DISAPPROVED: 'entityDisapproved',
  IN_PROCESS: 'entityProcessing',
  PENDING_REVIEW: 'entityPendingReview',
  WITH_ISSUES: 'entityWithIssues',
  PENDING_BILLING_INFO: 'entityPendingBilling',
  PREAPPROVED: 'entityPreapproved',
  INACTIVE: 'entityInactive',
} as const;
type EntityStatusMessageKey =
  | (typeof STATUS_MESSAGE_KEYS)[keyof typeof STATUS_MESSAGE_KEYS]
  | 'entityUnknown';

export function humanizeStatus(
  status: string,
  translate?: (key: EntityStatusMessageKey) => string,
): string {
  if (translate) {
    const key = STATUS_MESSAGE_KEYS[status.toUpperCase() as keyof typeof STATUS_MESSAGE_KEYS];
    return translate(key ?? 'entityUnknown');
  }
  const words = status.toLowerCase().replaceAll('_', ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Unknown';
}

export function EntityStatusPill({ status, className }: { status: string; className?: string }) {
  const uiText = useTranslations('scale');
  if (status === 'ACTIVE') {
    return (
      <Pill variant="success" className={className}>
        <PillIndicator variant="success" />
        {humanizeStatus(status, uiText)}
      </Pill>
    );
  }
  return (
    <Pill variant={status === 'DELETED' ? 'destructive' : 'muted'} className={className}>
      <span
        aria-hidden="true"
        className={cn(
          'size-2 rounded-full',
          status === 'PAUSED' && 'bg-muted-foreground/70',
          status === 'DELETED' && 'bg-destructive/70',
          status !== 'PAUSED' && status !== 'DELETED' && 'bg-muted-foreground/30',
        )}
      />
      {humanizeStatus(status, uiText)}
    </Pill>
  );
}
