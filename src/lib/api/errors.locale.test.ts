import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import es from '../../../messages/common/es.json';
import { uiErrorMessage } from '@/i18n/errors';
import { toApiError } from './errors';

const translate = createTranslator({ locale: 'es', messages: es });

describe('localized API failure boundary', () => {
  it('retains structured facts and diagnostic responses while localizing visible guidance', async () => {
    const payload = { code: 'permission_denied', message: 'private provider diagnostic', field: 'budget' };
    const error = await toApiError(new Response(JSON.stringify(payload), { status: 403 }));
    expect(error.payload).toEqual(payload);
    expect(error.code).toBe('permission_denied');
    expect(uiErrorMessage(error, translate)).toBe(es.permissionDenied);
  });
  it('supports legacy error-code fields without replacing the compatible payload', async () => {
    const error = await toApiError(new Response(JSON.stringify({ error: 'invalid_credentials', message: 'private auth diagnostic' }), { status: 400 }));
    expect(error.code).toBeUndefined();
    expect(uiErrorMessage(error, translate)).toBe(es.invalidCredentials);
  });
  it('refuses malformed envelopes and uses safe status guidance', async () => {
    const error = await toApiError(new Response(JSON.stringify({ message: { secret: 'private' } }), { status: 503, statusText: 'Service Unavailable' }));
    expect(error.payload).toBeUndefined();
    expect(uiErrorMessage(error, translate)).toBe(es.serviceUnavailable);
  });
});
