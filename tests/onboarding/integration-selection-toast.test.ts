import { expect, test } from 'bun:test';
import { createTranslator } from 'next-intl';
import { englishMessages } from '@/i18n/__tests__/render';
import { createIntegrationSelectionToastOptions } from '@/lib/ui/integrationSelectionToast';

const t = createTranslator({ locale: 'en', messages: englishMessages, namespace: 'common' });

test('integration selection toast uses success for tagging and info for untagging', () => {
  expect(createIntegrationSelectionToastOptions({ checked: true }, t).variant).toBe('success');
  expect(createIntegrationSelectionToastOptions({ checked: false }, t).variant).toBe('info');
});

test('integration selection toast uses singular title and label description', () => {
  const toast = createIntegrationSelectionToastOptions({ checked: true, label: 'Acme IG' }, t);
  expect(toast.title).toBe('Tagged integration');
  expect(toast.description).toBe('Acme IG');
});

test('integration selection toast uses plural title without description', () => {
  const toast = createIntegrationSelectionToastOptions(
    {
      checked: false,
      count: 3,
      label: 'Ignored',
    },
    t,
  );
  expect(toast.title).toBe('Untagged 3 integrations');
  expect(toast.description).toBeUndefined();
});
