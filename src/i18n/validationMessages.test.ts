import { describe, expect, it } from 'bun:test';
import { createTranslator } from 'next-intl';
import { z } from 'zod';
import en from '../../messages/common/en.json';
import es from '../../messages/common/es.json';
import pt from '../../messages/common/pt-BR.json';
import { createValidationErrorMap } from './validationMessages';

const schema = z.object({
  name: z.string().min(3).max(5),
  email: z.email(),
  quantity: z.number().gt(1).max(2000),
  tags: z.array(z.string()).min(1),
});
describe('per-parse validation localization', () => {
  for (const [locale, messages] of [
    ['en', en],
    ['pt-BR', pt],
    ['es', es],
  ] as const) {
    const t = createTranslator({
      locale,
      messages: { common: messages },
      namespace: 'common',
      onError: (error) => {
        throw error;
      },
    });
    const error = createValidationErrorMap(t, locale);
    it(`${locale}: translates stable issue codes with exact constraints and leaves successful data unchanged`, () => {
      const result = schema.safeParse(
        { name: 'x', email: 'invalid', quantity: 1, tags: [] },
        { error },
      );
      expect(result.success).toBe(false);
      if (result.success) throw Error('Expected validation issues');
      expect(result.error.issues.map((issue) => issue.message)).toEqual([
        t('validationMinCharacters', { count: 3 }),
        t('validationEmail'),
        t('validationGreaterThan', { limit: '1' }),
        t('validationMinItems', { count: 1 }),
      ]);
      expect(result.error.issues.map((issue) => issue.code)).toEqual([
        'too_small',
        'invalid_format',
        'too_small',
        'too_small',
      ]);
      const data = {
        name: 'Valid',
        email: 'person@example.com',
        quantity: 619.99,
        tags: ['USD'],
      };
      expect(schema.parse(data, { error })).toEqual(data);
    });
    it(`${locale}: retains custom-message precedence and bigint precision`, () => {
      const custom = t('validationRejectReasonMin', { count: 3 });
      const result = z.string().min(3, custom).safeParse('x', { error });
      expect(result.error?.issues[0].message).toBe(custom);
      const minimum = 9007199254740993n;
      const big = z.bigint().min(minimum).safeParse(0n, { error });
      expect(big.error?.issues[0].message).toContain(
        new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(minimum),
      );
    });
  }
  it('allows simultaneous locales on one schema without changing global defaults', async () => {
    const original = z.string().min(3).safeParse('x').error?.issues[0].message;
    const parses = await Promise.all(
      (
        [
          ['en', en],
          ['pt-BR', pt],
          ['es', es],
        ] as const
      ).map(async ([locale, messages]) => {
        const t = createTranslator({
          locale,
          messages: { common: messages },
          namespace: 'common',
        });
        const result = await schema.safeParseAsync(
          { name: 'x', email: 'invalid', quantity: 1, tags: [] },
          { error: createValidationErrorMap(t, locale) },
        );
        return result.error?.issues[0].message;
      }),
    );
    expect(new Set(parses).size).toBe(3);
    expect(z.string().min(3).safeParse('x').error?.issues[0].message).toBe(original);
  });
});
