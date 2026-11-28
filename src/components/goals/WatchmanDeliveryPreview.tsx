'use client';

import { watchmanDeliveryDataSchema } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { SafeMarkdown } from '@/components/ui/SafeMarkdown';

/** The Goal overview renders a delivery for review while keeping raw provenance available. */
export function WatchmanDeliveryPreview({ data }: { data: unknown }) {
  const t = useTranslations('dashboard');
  const parsed = watchmanDeliveryDataSchema.safeParse(data);
  if (!parsed.success)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        {t('this_artifact_has_no_written_evidence_yet_1b4da37')}
      </p>
    );
  const delivery = parsed.data;
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm leading-6">{delivery.delivery.summary}</p>
      {delivery.delivery.markdown ? (
        <SafeMarkdown
          content={delivery.delivery.markdown}
          mode="static"
          className="prose prose-sm dark:prose-invert max-w-none"
        />
      ) : null}
      <p className="text-xs text-muted-foreground">{t('watchman_delivery_unverified')}</p>
      <p className="text-xs font-medium">
        {t('watchman_delivery_operations', { count: delivery.operationReceipts.length })}
      </p>
      {(
        [
          ['limitations', 'watchman_delivery_limitations'],
          ['followUps', 'watchman_delivery_followups'],
        ] as const
      ).map(([key, label]) =>
        delivery.openItems[key].length ? (
          <div key={key}>
            <h4 className="text-xs font-semibold">{t(label)}</h4>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {delivery.openItems[key].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}
