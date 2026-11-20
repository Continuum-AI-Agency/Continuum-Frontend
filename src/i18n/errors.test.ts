import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import { ApiError } from '@/lib/api/errors';
import es from '../../messages/common/es.json';
import { LocalizedUiError, uiErrorKey, uiErrorMessage, uiErrorSentence } from './errors';

describe('localized UI errors', () => {
  it('rewords known codes and statuses the Backend gave no sentence for', () => {
    const t = createTranslator({ locale: 'es', messages: es });
    expect(uiErrorMessage(new ApiError('403 Forbidden', 403), t)).toBe(
      'No tienes permiso para realizar esta acción.',
    );
    expect(uiErrorKey({ code: 'otp_expired', message: 'private diagnostic' })).toBe('codeExpired');
    expect(
      uiErrorMessage(
        new ApiError('slow down', 429, 'rate_limited', {
          code: 'rate_limited',
          message: 'slow down',
        }),
        t,
      ),
    ).toBe(uiErrorMessage({ code: 'rate_limited' }, t));
  });
  it("shows the Backend's own sentence instead of its status's generic copy", () => {
    const t = createTranslator({ locale: 'es', messages: es });
    const said = (status: number, payload: Record<string, unknown>) =>
      uiErrorMessage(new ApiError('ignored', status, undefined, payload), t);
    expect(said(400, { message: 'The prompt is too long.' })).toBe('The prompt is too long.');
    expect(said(404, { error: 'Brand not found' })).toBe('Brand not found');
    expect(said(422, { error: 'template_fonts_missing' })).toBe(
      uiErrorMessage(new ApiError('', 422), t),
    );
    expect(said(503, { error: 'Service Unavailable' })).toBe(
      uiErrorMessage(new ApiError('', 503), t),
    );
    expect(uiErrorMessage(new Error('Draft is locked'), t)).toBe('Draft is locked');
  });
  it('never shows a library string, a stack or JSON as the reason', () => {
    const t = createTranslator({ locale: 'es', messages: es });
    const generic = uiErrorMessage(null, t);
    expect(uiErrorMessage(new Error('Could not load: TypeError: Failed to fetch'), t)).toBe(
      generic,
    );
    expect(uiErrorMessage(new Error('{"code":"PGRST116"}'), t)).toBe(generic);
    expect(
      uiErrorMessage(
        new ApiError('x', 400, undefined, { message: 'TypeError: x is undefined' }),
        t,
      ),
    ).toBe(uiErrorMessage(new ApiError('', 400), t));
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
