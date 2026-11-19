'use client';

// The brand's custom-field vocabulary, read once per surface that needs it
// (asset sidebar, filter bar, board group-by picker). The GET seeds the brand's
// defaults on first use, so `fields` being empty means the brand really has none
// — an empty panel is a state to design for, not a load that has not landed yet
// (that is `fields === null`).

import type { CustomField } from '@continuum/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useUiErrorMessage } from '@/i18n/errors';
import { listCustomFields } from '@/lib/library/customFields';

export type UseCustomFieldsResult = {
  /** null until the first read lands. */
  fields: CustomField[] | null;
  error: string | null;
  refresh: () => Promise<void>;
  /** Applies a field the caller just wrote, so the surface does not re-read to see it. */
  replaceFields: (fields: CustomField[]) => void;
};

export function useCustomFields(brandId: string): UseCustomFieldsResult {
  const uiErrorText = useUiErrorMessage();
  const [fields, setFields] = useState<CustomField[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      const next = await listCustomFields({ brandId });
      setFields(next);
      setFailure(null);
    } catch (err) {
      setFields([]);
      setFailure(err);
    }
  }, [brandId]);

  useEffect(() => {
    let cancelled = false;
    listCustomFields({ brandId })
      .then((next) => {
        if (!cancelled) {
          setFields(next);
          setFailure(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFields([]);
          setFailure(err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  return {
    fields,
    error: failure === null ? null : uiErrorText(failure),
    refresh: load,
    replaceFields: setFields,
  };
}
