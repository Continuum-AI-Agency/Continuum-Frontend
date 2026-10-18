'use client';

// Bulk "Attach creative…": one library pick applied to every selected draft, and saved where
// publish reads it, through the field route's media patch, as a pick in the panel is. It used
// to stop at the store, so the creative was gone on the next load and never posted.

import * as React from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useToast } from '@/components/ui/ToastProvider';
import { useCalendarStore } from '@/lib/organic/store';
import { useDraftFieldPersistence } from './useDraftFieldEditor';

type PublishingAssets = NonNullable<OrganicCalendarDraft['publishingAssets']>;

export function useAttachCreative(): (
  targets: readonly OrganicCalendarDraft[],
  publishingAssets: PublishingAssets,
) => void {
  const updateDraft = useCalendarStore((state) => state.updateDraft);
  const { show } = useToast();
  const { persistDraftFields } = useDraftFieldPersistence();

  return React.useCallback(
    (targets, publishingAssets) => {
      const primary = publishingAssets[0];
      // The suggestion mirrors the assets, so the publish gate and media staging agree.
      const mediaPatch: OrganicCalendarDraft['mediaSuggestion'] = {
        mediaStatus: 'user_supplied',
        kind: primary?.kind ?? undefined,
        bucket: primary?.bucket ?? undefined,
        url: primary?.storagePath ?? undefined,
      };
      for (const before of targets) {
        const mediaSuggestion = { ...before.mediaSuggestion, ...mediaPatch };
        updateDraft(before.id, (draft) => ({ ...draft, publishingAssets, mediaSuggestion }));
        void persistDraftFields(before, { media: { publishingAssets, mediaSuggestion } }).then(
          (result) => {
            if (result.ok) {
              const { updatedAt } = result;
              if (updatedAt) updateDraft(before.id, (draft) => ({ ...draft, updatedAt }));
              return;
            }
            updateDraft(before.id, (draft) => ({
              ...draft,
              publishingAssets: before.publishingAssets,
              mediaSuggestion: before.mediaSuggestion,
            }));
            show({ title: 'Creative not attached', description: result.message, variant: 'error' });
          },
        );
      }
    },
    [persistDraftFields, show, updateDraft],
  );
}
