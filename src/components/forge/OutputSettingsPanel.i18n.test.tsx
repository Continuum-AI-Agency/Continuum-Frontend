import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import {
  chooseOption,
  installPickerDomGlobals,
} from '@/components/automations/workspace/pickers/pickerTestHarness';
import commonEs from '../../../messages/common/es.json';
import commonPt from '../../../messages/common/pt-BR.json';
import forgeEs from '../../../messages/forge/es.json';
import forgePt from '../../../messages/forge/pt-BR.json';
import { EncodeSettingsFields } from './OutputSettingsPanel';

installPickerDomGlobals();
afterEach(cleanup);

describe('localized encode settings', () => {
  for (const entry of [
    {
      locale: 'pt-BR' as const,
      messages: { common: commonPt, forge: forgePt },
      frameRate: 'Taxa de quadros',
    },
    {
      locale: 'es' as const,
      messages: { common: commonEs, forge: forgeEs },
      frameRate: 'Frecuencia de fotogramas',
    },
  ]) {
    test(`${entry.locale}: formats rates without changing the encoder value`, async () => {
      const onSet = mock(() => undefined);
      render(
        <NextIntlClientProvider locale={entry.locale} timeZone="UTC" messages={entry.messages}>
          <EncodeSettingsFields
            settings={{ fps: '30000/1001' }}
            inherited={[{ container: 'mp4', settings: undefined }]}
            onSet={onSet}
          />
        </NextIntlClientProvider>,
      );

      const trigger = screen.getByRole('combobox', { name: entry.frameRate });
      expect(trigger.textContent).toContain('29,97 fps');
      fireEvent.click(trigger);
      await screen.findByRole('option', { name: '24 fps' });
      chooseOption('24 fps');
      expect(onSet).toHaveBeenCalledWith({ fps: 24 });
    });
  }
});
