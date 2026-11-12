import type {
  AutomationCapabilityAvailability,
  AutomationCapabilityLifecycle,
} from '@continuum/contracts';
import type { useTranslations } from 'next-intl';

export function automationCapabilityDescription(
  capability: {
    availability: AutomationCapabilityAvailability;
    lifecycle: AutomationCapabilityLifecycle;
  },
  translate: ReturnType<typeof useTranslations<'automations'>>,
): string | null {
  if (capability.availability === 'needs_connection') return translate('needsConnectionDetail');
  if (capability.availability === 'unavailable') return translate('unavailableDetail');
  if (capability.lifecycle === 'preview') return translate('previewDetail');
  return null;
}
