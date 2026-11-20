import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import { ApiError } from '@/lib/api/errors';
import es from '../../messages/common/es.json';
import { LocalizedUiError, uiErrorKey, uiErrorMessage, uiErrorSentence } from './errors';

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
  it('shows a server sentence whole and rewords only known codes', () => {
    const t = createTranslator({ locale: 'es', messages: es });
    expect(uiErrorSentence(new Error('Draft is locked'), t)).toBe('Draft is locked');
    expect(uiErrorSentence({ code: 'rate_limited', message: 'slow down' }, t)).toBe(
      uiErrorMessage({ code: 'rate_limited' }, t),
    );
    expect(uiErrorSentence(new ApiError('internal', 403), t)).toBe(
      'No tienes permiso para realizar esta acción.',
    );
    expect(uiErrorSentence(new Error(' '), t, 'Indexing failed')).toBe('Indexing failed');
    expect(uiErrorSentence(null, t)).toBe('Ocurrió un error inesperado. Inténtalo de nuevo.');
  });
});
