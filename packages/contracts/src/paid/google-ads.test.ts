import { describe, expect, test } from 'bun:test';
import {
  GOOGLE_ADS_API_VERSION,
  GoogleAdsFailureSchema,
  googleAdsErrorCodes,
  googleAdsFailureFromBody,
} from './google-ads';

// The REST shape of a v25 GoogleAdsFailure (protobuf JSON mapping: camelCase, int64 as string).
const budgetBelowMinimum = {
  errors: [
    {
      errorCode: { campaignBudgetError: 'BUDGET_BELOW_PER_DAY_MINIMUM' },
      message: 'The budget is below the per-day minimum.',
      location: {
        fieldPathElements: [
          { fieldName: 'operations', index: 1 },
          { fieldName: 'update' },
          { fieldName: 'amount_micros' },
        ],
      },
      details: { budgetPerDayMinimumErrorDetails: { minimumBudgetAmountMicros: '10000000' } },
    },
  ],
  requestId: 'aBcD1234',
};

describe('GOOGLE_ADS_API_VERSION', () => {
  test('is pinned once, at v25', () => {
    expect(GOOGLE_ADS_API_VERSION).toBe('v25');
  });
});

describe('GoogleAdsFailureSchema', () => {
  test('reads the failing operation index, the code and the structured minimum', () => {
    const failure = GoogleAdsFailureSchema.parse(budgetBelowMinimum);
    expect(failure.requestId).toBe('aBcD1234');
    expect(failure.errors[0]?.location?.fieldPathElements[0]?.index).toBe(1);
    expect(
      failure.errors[0]?.details?.budgetPerDayMinimumErrorDetails?.minimumBudgetAmountMicros,
    ).toBe('10000000');
    expect(googleAdsErrorCodes(failure)).toEqual(['BUDGET_BELOW_PER_DAY_MINIMUM']);
  });

  test('keeps a quota retry delay', () => {
    const failure = GoogleAdsFailureSchema.parse({
      errors: [
        {
          errorCode: { quotaError: 'RESOURCE_TEMPORARILY_EXHAUSTED' },
          message: 'Too many requests.',
          details: { quotaErrorDetails: { retryDelay: '30s' } },
        },
      ],
    });
    expect(failure.errors[0]?.details?.quotaErrorDetails?.retryDelay).toBe('30s');
  });

  test('refuses an error without a code', () => {
    expect(
      GoogleAdsFailureSchema.safeParse({ errors: [{ message: 'x', errorCode: {} }] }).success,
    ).toBe(false);
  });
});

describe('googleAdsFailureFromBody', () => {
  const detail = {
    '@type': `type.googleapis.com/google.ads.googleads.${GOOGLE_ADS_API_VERSION}.errors.GoogleAdsFailure`,
    ...budgetBelowMinimum,
  };

  test('a plain REST error envelope', () => {
    const body = {
      error: {
        code: 400,
        message: 'Request contains an invalid argument.',
        status: 'INVALID_ARGUMENT',
        details: [detail],
      },
    };
    expect(googleAdsFailureFromBody(body)?.requestId).toBe('aBcD1234');
  });

  test('searchStream array-wraps the same envelope', () => {
    const body = [
      { error: { code: 400, message: 'bad', status: 'INVALID_ARGUMENT', details: [detail] } },
    ];
    expect(googleAdsFailureFromBody(body)?.errors).toHaveLength(1);
  });

  test('a partial_failure mutate response', () => {
    const body = {
      results: [{}, {}],
      partialFailureError: { code: 3, message: 'Multiple errors', details: [detail] },
    };
    expect(googleAdsErrorCodes(googleAdsFailureFromBody(body))).toEqual([
      'BUDGET_BELOW_PER_DAY_MINIMUM',
    ]);
  });

  test('null when the body carries no GoogleAdsFailure (some 403s do not)', () => {
    expect(
      googleAdsFailureFromBody({
        error: { code: 403, message: 'denied', status: 'PERMISSION_DENIED' },
      }),
    ).toBeNull();
    expect(googleAdsFailureFromBody({ results: [] })).toBeNull();
    expect(googleAdsFailureFromBody('not json')).toBeNull();
    expect(googleAdsErrorCodes(null)).toEqual([]);
  });
});
