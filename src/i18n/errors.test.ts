import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import { ApiError } from '@/lib/api/errors';
import es from '../../messages/common/es.json';
import { LocalizedUiError, uiErrorKey, uiErrorMessage } from './errors';

describe('localized UI errors', () => {
  it('preserves actionable codes without exposing raw provider diagnostics', () => {
    const t = createTranslator({ locale: 'es', messages: es });
    expect(uiErrorMessage(new ApiError('internal endpoint credential failed', 403), t)).toBe(
      'No tienes permiso para realizar esta acción.',
    );
    expect(uiErrorKey({ code: 'otp_expired', message: 'private diagnostic' })).toBe('codeExpired');
    expect(uiErrorMessage(new Error('private diagnostic'), t)).toBe(
      'Ocurrió un error inesperado. Inténtalo de nuevo.',
    );
  });
  it('retains application messages already translated at their origin', () => {
    expect(
      uiErrorMessage(new LocalizedUiError('Revisa la pista seleccionada.'), () => 'fallback'),
    ).toBe('Revisa la pista seleccionada.');
  });
});
