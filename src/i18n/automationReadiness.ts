import type { useTranslations } from 'next-intl';
import type { PublishBlocker } from '@/lib/automations/publish-readiness';

export function automationReadinessMessage(
  blocker: PublishBlocker,
  t: ReturnType<typeof useTranslations<'automations'>>,
) {
  const values = { node: blocker.nodeLabel };
  switch (blocker.code) {
    case 'capability_unavailable':
      return {
        title: t('readinessTitleUnavailable'),
        message: t('readinessUnavailable', values),
        detail: t('unavailableDetail'),
      };
    case 'capability_preview':
      return {
        title: t('readinessTitlePreview'),
        message: t('readinessPreview', values),
        detail: t('previewDetail'),
      };
    case 'unset_configuration':
      return {
        title: t('readinessTitleUnset'),
        message: t('readinessUnset', values),
        detail:
          blocker.configurationPath && blocker.placeholder
            ? t('readinessUnsetDetail', {
                path: blocker.configurationPath,
                placeholder: blocker.placeholder,
              })
            : t('readinessUnsetGeneric'),
      };
    case 'missing_webhook_binding':
      return {
        title: t('readinessTitleWebhook'),
        message: t('readinessWebhook', values),
        detail: t(
          blocker.nodeType === 'trigger.webhook'
            ? 'readinessInboundDetail'
            : 'readinessOutboundDetail',
        ),
      };
  }
}
