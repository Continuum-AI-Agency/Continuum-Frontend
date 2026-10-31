'use client';

import type { TemplateAuthoringWorkingCopy, TemplateRevision, TemplateRevisionVariant } from '@continuum/contracts';
import { useEffect, useRef, useState } from 'react';
import { fetchTemplateAuthoringUserId, openTemplateAuthoringWorkingCopy } from '@/lib/library/templateSources';
import { revisionIsReadOnly } from './revisionSelection';

export function useTemplateAuthoringWorkingCopy({ brandId, requestKey, selection, enabled }: {
  brandId: string;
  requestKey: string;
  selection: { variant: TemplateRevisionVariant; revision: TemplateRevision } | undefined;
  enabled: boolean;
}) {
  const [state, setState] = useState<{ requestKey: string; copy: TemplateAuthoringWorkingCopy | null; error: string | null; loading: boolean }>(
    { requestKey, copy: null, error: null, loading: false });
  const generation = useRef(0);
  const [retry, setRetry] = useState(0);
  const variantId = selection?.variant.variantId;
  const revisionId = selection?.revision.id;
  useEffect(() => {
    const run = ++generation.current;
    if (!enabled || !selection || revisionIsReadOnly(selection)) return;
    if (state.requestKey === requestKey && state.copy && !state.copy.closedAt) return;
    let current = true;
    setState({ requestKey, copy: null, error: null, loading: true });
    void (async () => {
      const userId = await fetchTemplateAuthoringUserId();
      const copy = await openTemplateAuthoringWorkingCopy(selection.variant.templateId, {
        brandId, variantId: selection.variant.variantId, baseRevisionId: selection.revision.id,
      }, userId);
      if (current && generation.current === run) setState({ requestKey, copy, error: null, loading: false });
    })().catch((error: unknown) => {
      if (current && generation.current === run) setState({ requestKey, copy: null,
        error: error instanceof Error ? error.message : 'The private working copy could not be opened.', loading: false });
    });
    return () => { current = false; };
  }, [brandId, requestKey, variantId, revisionId, enabled, retry]);
  const copy = state.requestKey === requestKey ? state.copy : null;
  return {
    copy,
    loading: enabled && (!selection || state.requestKey !== requestKey || state.loading),
    error: state.requestKey === requestKey ? state.error : null,
    readOnly: !!selection && (selection.variant.original || !!selection.variant.archivedAt || !copy && revisionIsReadOnly(selection)),
    retry: () => setRetry((value) => value + 1),
  };
}
