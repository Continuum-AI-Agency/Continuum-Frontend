import { describe, expect, test } from 'bun:test';
import { createHmac, randomBytes } from 'node:crypto';
import { createTranslator } from 'next-intl';
import { ApiError } from '@/lib/api/errors';
import en from '../../../../messages/scale/en.json';
import es from '../../../../messages/scale/es.json';
import pt from '../../../../messages/scale/pt-BR.json';
import {
  capiErrorMessage,
  capiIssueMessage,
  chunk,
  invalidEventIssues,
  leafPaths,
  reviewCsv,
  signedCurl,
  standardWebhookSignature,
} from './capiHelpers';

const NOW = 1_800_000_000;

describe('capi helpers', () => {
  test('leafPaths walks objects and indexes arrays', () => {
    expect(
      leafPaths({ contact: { email: 'a@b.co', tags: [] }, lines: [{ amount: 5 }], ok: null }),
    ).toEqual(['contact.email', 'lines.0.amount', 'ok']);
  });

  test('chunk splits at the request cap', () => {
    expect(chunk(Array.from({ length: 2_001 }, (_, i) => i)).map((c) => c.length)).toEqual([
      1_000, 1_000, 1,
    ]);
  });

  test('reviewCsv: quoted cells, embedded commas, CRLF; bad and stale rows are reported by line', () => {
    const csv = [
      'Email,Value,currency,event_time,content_name',
      `a@b.co,"1,250.50",usd,${NOW - 60},"Sofa, ""Deluxe"""`,
      `,10,USD,${NOW},Nothing to match on`,
      `old@b.co,10,USD,${NOW - 30 * 86_400},Too old`,
    ].join('\r\n');
    const review = reviewCsv(csv, { eventName: 'Purchase', actionSource: 'system_generated' }, NOW);
    expect(review.events).toEqual([
      {
        event_name: 'Purchase',
        event_time: NOW - 60,
        action_source: 'system_generated',
        user: { email: 'a@b.co' },
        custom_data: { value: 1250.5, currency: 'usd', content_name: 'Sofa, "Deluxe"' },
      },
    ]);
    expect(review.issues.map((issue) => issue.line)).toEqual([3, 4]);
    expect(review.issues[0]?.message).toContain('needs at least one of email');
    expect(review.issues[1]?.message).toBe('event_time is older than 7 days');
  });

  test('the signature matches a Standard Webhooks verifier over the decoded secret bytes', async () => {
    const key = randomBytes(32);
    const secret = `whsec_${key.toString('base64url')}`;
    const expected = createHmac('sha256', key).update(`msg_1.${NOW}.{"a":1}`).digest('base64');
    expect(await standardWebhookSignature(secret, 'msg_1', NOW, '{"a":1}')).toBe(`v1,${expected}`);
    const curl = await signedCurl('https://api.example.com/h/x', `{"q":"it's"}`, secret, NOW);
    expect(curl).toContain(`'webhook-timestamp: ${NOW}'`);
    expect(curl).toContain(`-d '{"q":"it'\\''s"}'`);
  });

  test('invalidEventIssues reads only a 400 invalid_events body', () => {
    const issues = [{ index: 2, message: 'user: needs an identifier' }];
    const error = new ApiError('invalid_events', 400, undefined, {
      error: 'invalid_events',
      issues,
    });
    expect(invalidEventIssues(error)).toEqual(issues);
    expect(invalidEventIssues(new ApiError('nope', 403))).toBeNull();
  });
});

for (const locale of ['en', 'pt-BR', 'es'] as const) {
  test(`localized CAPI guidance preserves fields and hides provider details (${locale})`, () => {
    const translate = createTranslator({
      locale,
      namespace: 'scale',
      messages: { scale: { en, 'pt-BR': pt, es }[locale] },
    });
    const issue = {
      code: 'event_time_too_old' as const,
      path: ['event_time'],
      details: { maxAgeDays: 62 },
    };
    const message = capiIssueMessage(issue, translate);
    expect(message).toContain('62');
    expect(message).toContain('event_time');
    expect(issue).toEqual({
      code: 'event_time_too_old',
      path: ['event_time'],
      details: { maxAgeDays: 62 },
    });
    expect(capiErrorMessage(new Error('private.backend.example'), '', translate)).toBe(
      translate('capi_request_failed'),
    );
    const csv = `email,event_time\na@example.com,${NOW - 30 * 86400}`;
    const review = reviewCsv(
      csv,
      { eventName: 'Lead', actionSource: 'system_generated' },
      NOW,
      translate,
    );
    expect(review.events).toEqual([]);
    expect(review.issues[0].line).toBe(2);
    expect(review.issues[0].message).toBe(translate('capi_issue_old', { maxAgeDays: 7 }));
  });
}
