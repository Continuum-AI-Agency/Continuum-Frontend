'use client';

import {
  type HeadlessElementReviewState,
  headlessElementReviewStateSchema,
} from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { signLibraryAsset } from '@/lib/ai-studio/elements';
import { http } from '@/lib/api/http';

/** The same reusable Element seen in Canvas and Library, with its generation approvals. */
export function HeadlessElementReview({
  brandId,
  elementId,
  updatedAt,
}: {
  brandId: string;
  elementId: string;
  updatedAt: string;
}) {
  const client = useQueryClient();
  const state = useQuery({
    queryKey: ['headless-element', brandId, elementId, updatedAt],
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
      await client.invalidateQueries({ queryKey: ['headless-element', brandId, elementId] });
      await client.invalidateQueries({ queryKey: ['elements'] });
    },
  });
  if (!revision) return null;
  const ready = revision.approved && (revision.kind !== 'character' || pack?.approved);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">
        Reusable generation {revision.kind === 'character' ? 'actress' : revision.kind}
      </p>
      <p className="text-xs text-muted-foreground">
        {ready
          ? 'Approved for reuse. Finished ads still need their own approval.'
          : 'Review this Element before it is reused in an ad.'}
      </p>
      {revision.kind === 'scene' ? (
        <p className="text-xs">{revision.payload.setting}</p>
      ) : revision.kind === 'product' ? (
        <p className="text-xs">{revision.payload.concept}</p>
      ) : null}
      {pack && preview.data ? (
        <img
          src={preview.data}
          alt="Actress identity candidate"
          className="w-full rounded object-contain"
        />
      ) : null}
      {revision.kind === 'character' && !pack ? (
        <Button
          size="sm"
          variant="outline"
          disabled={action.isPending}
          onClick={() => action.mutate('prepare')}
        >
          Generate actress reference
        </Button>
      ) : null}
      {!ready && (revision.kind !== 'character' || pack) ? (
        <Button
          size="sm"
          disabled={action.isPending || (revision.kind === 'character' && !preview.data)}
          onClick={() => action.mutate('approve')}
        >
          Approve {revision.kind === 'character' ? 'actress and reference' : 'Element'}
        </Button>
      ) : null}
      {action.error ? (
        <p role="alert" className="text-xs text-destructive">
          {action.error.message}
        </p>
      ) : null}
    </div>
  );
}
