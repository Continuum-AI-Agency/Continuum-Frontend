// Google Ads API wire shapes shared by the edge, the Backend, the Optimizer's Google
// applier and its bench. The version is pinned HERE once: it used to live in two places,
// both stuck on v24. Design: docs/optimizer-multiplatform/google-acciones.html §3G and §6.

import { z } from 'zod';

export const GOOGLE_ADS_API_VERSION = 'v25' as const;

const FieldPathElementSchema = z.object({
  fieldName: z.string(),
  // 0-based index of the failing operation when the path starts at `operations`.
  index: z.number().int().nonnegative().optional(),
});

/** One error of a GoogleAdsFailure, in the REST (protobuf JSON) mapping: camelCase keys,
 *  int64 values as strings. `errorCode` is a oneof — exactly one `<family>Error` key whose
 *  value is the machine code (e.g. `{campaignBudgetError: 'BUDGET_BELOW_PER_DAY_MINIMUM'}`). */
export const GoogleAdsErrorSchema = z.object({
  errorCode: z
    .record(z.string(), z.string())
    .refine((code) => Object.keys(code).length > 0, 'errorCode names no error'),
  message: z.string(),
  trigger: z.record(z.string(), z.unknown()).optional(),
  location: z.object({ fieldPathElements: z.array(FieldPathElementSchema) }).optional(),
  details: z
    .object({
      budgetPerDayMinimumErrorDetails: z
        .object({ minimumBudgetAmountMicros: z.string().optional() })
        .passthrough()
        .optional(),
      quotaErrorDetails: z.object({ retryDelay: z.string().optional() }).passthrough().optional(),
    })
    .passthrough()
    .optional(),
});
export type GoogleAdsError = z.infer<typeof GoogleAdsErrorSchema>;

export const GoogleAdsFailureSchema = z.object({
  errors: z.array(GoogleAdsErrorSchema).min(1),
  requestId: z.string().optional(),
});
export type GoogleAdsFailure = z.infer<typeof GoogleAdsFailureSchema>;

const GOOGLE_ADS_FAILURE_TYPE = /\.errors\.GoogleAdsFailure$/;

/** A google.rpc.Status — both the REST `error` envelope and a mutate's `partialFailureError`. */
const RpcStatusSchema = z.object({
  code: z.number().int().optional(),
  message: z.string().optional(),
  details: z.array(z.record(z.string(), z.unknown())).optional(),
});

function failureFromStatus(status: unknown): GoogleAdsFailure | null {
  const parsed = RpcStatusSchema.safeParse(status);
  if (!parsed.success) return null;
  for (const detail of parsed.data.details ?? []) {
    const type = detail['@type'];
    if (typeof type === 'string' && !GOOGLE_ADS_FAILURE_TYPE.test(type)) continue;
    const failure = GoogleAdsFailureSchema.safeParse(detail);
    if (failure.success) return failure.data;
  }
  return null;
}

/** The GoogleAdsFailure inside a parsed response body, or null when there is none. Handles
 *  the plain REST error envelope, searchStream's array-wrapped one, and a partial_failure
 *  mutate's `partialFailureError`. Some 403s carry no failure at all — that is null, not a
 *  throw, so the caller can still report the HTTP status. */
export function googleAdsFailureFromBody(body: unknown): GoogleAdsFailure | null {
  if (Array.isArray(body)) {
    for (const item of body) {
      const failure = googleAdsFailureFromBody(item);
      if (failure) return failure;
    }
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  return failureFromStatus(record.error) ?? failureFromStatus(record.partialFailureError);
}

/** Every machine code in a failure, in order (e.g. ['NON_MULTIPLE_OF_MINIMUM_CURRENCY_UNIT']). */
export function googleAdsErrorCodes(failure: GoogleAdsFailure | null): string[] {
  if (!failure) return [];
  return failure.errors.flatMap((error) => Object.values(error.errorCode));
}
