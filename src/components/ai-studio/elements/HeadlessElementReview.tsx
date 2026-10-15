'use client';

import {
  type HeadlessElementReviewState,
  headlessElementReviewStateSchema,
  isElementProductCategory,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type ElementRecord,
  elementsQueryKey,
  signLibraryAsset,
  useElementMutations,
} from '@/lib/ai-studio/elements';
import { http } from '@/lib/api/http';

/** The same reusable Element seen in Canvas and Library, with its generation approvals. */
export function HeadlessElementReview({
  brandId,
  element,
}: {
  brandId: string;
  element: ElementRecord;
}) {
  const elementId = element.id;
  const client = useQueryClient();
  const headlessQueryKey = ['headless-element', brandId, elementId];
  const state = useQuery({
    queryKey: [...headlessQueryKey, element.updatedAt],
    queryFn: () =>
      http.request<HeadlessElementReviewState>({
        path: `/api/headless/elements/state?brandId=${brandId}&elementId=${elementId}`,
        schema: headlessElementReviewStateSchema,
      }),
    retry: false,
  });
  const revision = state.data?.revision;
  const pack = state.data?.preparation;
  const preview = useQuery({
    queryKey: ['headless-element-preview', brandId, pack?.composite.versionId],
    queryFn: () => signLibraryAsset(brandId, pack!.composite.assetId, pack!.composite.versionId),
    enabled: Boolean(pack),
  });
  const action = useMutation({
    mutationFn: async (kind: 'prepare' | 'approve') => {
      if (!revision) return;
      const ref = { brandId, elementId, revision: revision.revision };
      if (kind === 'prepare')
        await http.request({
          path: '/api/headless/elements/prepare-character',
          method: 'POST',
          body: { ...ref, budgetCapUsd: 1 },
        });
      else {
        if (!revision.approved)
          await http.request({ path: '/api/headless/elements/approve', method: 'POST', body: ref });
        if (pack)
          await http.request({
            path: '/api/headless/elements/approve-character',
            method: 'POST',
            body: { ...ref, preparationSignature: pack.preparationSignature },
          });
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: headlessQueryKey });
      await client.invalidateQueries({ queryKey: elementsQueryKey(brandId) });
    },
  });
  const { promoteToHeadless: promote } = useElementMutations(brandId);
  const [rightsNote, setRightsNote] = React.useState('');

  const ready = Boolean(revision?.approved && (revision.kind !== 'character' || pack?.approved));
  // A product's click IS the approval, so it replaces the approve button rather than
  // sitting next to it. Offered once the state has answered, so an approved product
  // never flashes the action.
  const canPromote = isElementProductCategory(element.category) && !state.isLoading && !ready;
  const needsRightsNote = !element.rightsNote?.trim();
  if (!revision && !canPromote) return null;
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">
        {revision
          ? `Reusable generation ${revision.kind === 'character' ? 'actress' : revision.kind}`
          : 'Auto-ads'}
      </p>
      <p className="text-xs text-muted-foreground">
        {ready
          ? 'Approved for reuse. Finished ads still need their own approval.'
          : canPromote
            ? 'Approve this product so the Optimizer’s auto-ads can feature it.'
            : 'Review this Element before it is reused in an ad.'}
      </p>
      {revision?.kind === 'scene' ? (
        <p className="text-xs">{revision.payload.setting}</p>
      ) : revision?.kind === 'product' ? (
        <p className="text-xs">{revision.payload.concept}</p>
      ) : null}
      {pack && preview.data ? (
        <img
          src={preview.data}
          alt="Actress identity candidate"
          className="w-full rounded object-contain"
        />
      ) : null}
      {revision?.kind === 'character' && !pack ? (
        <Button
          size="sm"
          variant="outline"
          disabled={action.isPending}
          onClick={() => action.mutate('prepare')}
        >
          Generate actress reference
        </Button>
      ) : null}
      {revision && !ready && !canPromote && (revision.kind !== 'character' || pack) ? (
        <Button
          size="sm"
          disabled={action.isPending || (revision.kind === 'character' && !preview.data)}
          onClick={() => action.mutate('approve')}
        >
          Approve {revision.kind === 'character' ? 'actress and reference' : 'Element'}
        </Button>
      ) : null}
      {canPromote ? (
        <div className="flex flex-col gap-1.5">
          {needsRightsNote ? (
            <>
              <Label htmlFor={`element-${elementId}-auto-ads-rights`}>
                Rights basis for auto-ads
              </Label>
              <Input
                id={`element-${elementId}-auto-ads-rights`}
                value={rightsNote}
                placeholder="e.g. own product photography"
                onChange={(event) => setRightsNote(event.target.value)}
              />
            </>
          ) : null}
          <Button
            size="sm"
            className="self-start"
            disabled={promote.isPending || (needsRightsNote && !rightsNote.trim())}
            onClick={() =>
              promote.mutate(
                {
                  elementId,
                  ...(needsRightsNote ? { rightsNote: rightsNote.trim() } : {}),
                },
                { onSuccess: () => client.invalidateQueries({ queryKey: headlessQueryKey }) },
              )
            }
          >
            Use in auto-ads
          </Button>
        </div>
      ) : null}
      {promote.isSuccess ? (
        <p role="status" className="text-xs text-muted-foreground">
          Approved for auto-ads (revision {promote.data.revision}).
        </p>
      ) : null}
      {promote.error ? (
        <p role="alert" className="text-xs text-destructive">
          Could not approve for auto-ads: {promote.error.message}
        </p>
      ) : null}
      {action.error ? (
        <p role="alert" className="text-xs text-destructive">
          {action.error.message}
        </p>
      ) : null}
    </div>
  );
}
