import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import en from '../../messages/public/en.json';
import es from '../../messages/public/es.json';
import pt from '../../messages/public/pt-BR.json';
import { publicErrorMessage, publicFailureCode } from './publicErrors';

describe('public share errors', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: { public: messages },
      namespace: 'public',
    });
    it(`${locale}: explains stable reasons and preserves legacy response compatibility`, () => {
      expect(publicErrorMessage('share_passcode_invalid', t, 403)).toBe(
        messages.sharePasscodeInvalid,
      );
      expect(publicFailureCode({ error: 'The passcode is incorrect' })).toBe(
        'share_passcode_invalid',
      );
      expect(
        publicFailureCode({
          reasonCode: 'share_field_value_invalid',
          code: 'invalid_request',
          message: 'private detail',
        }),
      ).toBe('share_field_value_invalid');
      expect(publicErrorMessage('share_field_value_invalid', t, 400)).toBe(
        messages.shareFieldValueInvalid,
      );
    });
    it(`${locale}: unknown provider diagnostics cannot become visible copy`, () => {
      const diagnostic = 'private storage endpoint signed-key failure';
      expect(publicErrorMessage(publicFailureCode({ error: diagnostic }), t, 503)).toBe(
        messages.publicServiceUnavailable,
      );
      expect(publicErrorMessage(diagnostic, t)).toBe(messages.publicRequestFailed);
      expect(publicErrorMessage('version_conflict', t, 409)).toBe(messages.shareVersionConflict);
    });
  }
});
