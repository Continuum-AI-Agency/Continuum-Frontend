import type { useTranslations } from 'next-intl';
import type { ToastOptions } from '@/components/ui/ToastProvider';

type IntegrationSelectionToastParams = {
  checked: boolean;
  label?: string | null;
  count?: number;
};

export function createIntegrationSelectionToastOptions(
  params: IntegrationSelectionToastParams,
  t: ReturnType<typeof useTranslations<'common'>>,
): ToastOptions {
  const { checked, label, count } = params;
  const variant = checked ? 'success' : 'info';
  const hasCount = typeof count === 'number' && count > 1;
  const title = t('integrationSelection', {
    checked: checked ? 'yes' : 'no',
    count: hasCount ? count : 1,
  });
  const description = !hasCount && label ? label : undefined;

  return { title, description, variant };
}
