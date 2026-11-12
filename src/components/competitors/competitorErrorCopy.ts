import type { useTranslations } from 'next-intl';
import { localizeCompetitorCopy } from '@/i18n/competitorCopy';
import { ApiError } from '@/lib/api/errors';
export function competitorApiCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const value =
    error.code ?? error.payload?.code ?? error.payload?.errorCode ?? error.payload?.error;
  if (typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value)) return value;
  return /^[a-z][a-z0-9_]*$/.test(error.message) ? error.message : null;
}
export function competitorErrorCopy(
  error: unknown,
  known: Readonly<Record<string, string>>,
  t: ReturnType<typeof useTranslations<'competitor'>>,
  fallback: (error: unknown) => string,
): string {
  const code = competitorApiCode(error);
  return code && Object.hasOwn(known, code)
    ? localizeCompetitorCopy(known[code]!, t)
    : fallback(error);
}

/** A conflict is determined by structured HTTP status, never diagnostic prose. */
export function boardSaveErrorState(error: unknown): 'already_saved' | 'save_failed' {
  return error instanceof ApiError && error.status === 409 ? 'already_saved' : 'save_failed';
}
