import {
  type ApiRenderPreflightResponse,
  implementationRenderRequests,
} from '@continuum/contracts';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useStudioStore } from '../stores/useStudioStore';
import type { ApiRenderNodeData } from '../types';
import { apiRendersApi } from './api-render/apiRendersApi';

export function ForgeDeliveryReview({ id, data }: { id: string; data: ApiRenderNodeData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    signature: string;
    brandId: string;
    roomId?: string;
    reviews: ApiRenderPreflightResponse[];
  } | null>(null);
  const requests = () => {
    const state = useStudioStore.getState();
    if (!state.brandId) throw new Error('Choose a brand.');
    const node = state.getNodeById(id);
    if (!node) throw new Error('This node no longer exists.');
    return implementationRenderRequests({
      brandId: state.brandId,
      nodeId: id,
      data: node.data as Record<string, unknown>,
      nodes: state.nodes,
      edges: state.edges,
      delivery: true,
    });
  };
  const review = async () => {
    setBusy(true);
    setError(null);
    try {
      const values = requests();
      const state = useStudioStore.getState();
      const brandId = state.brandId!;
      const roomId = state.activeRoomId;
      const reviews = [];
      for (const value of values) {
        const prepared = await apiRendersApi.preflight(value);
        if (!prepared.target || !prepared.renderInput)
          throw new Error(
            'The server did not return the destination and frozen values. Refresh and review again.',
          );
        reviews.push(prepared);
      }
      setPending({ signature: JSON.stringify(values), brandId, roomId, reviews });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare delivery review.');
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    const review = pending;
    setPending(null);
    if (!review) return;
    setBusy(true);
    const submitted: string[] = [];
    try {
      const state = useStudioStore.getState();
      if (
        state.brandId !== review.brandId ||
        state.activeRoomId !== review.roomId ||
        JSON.stringify(requests()) !== review.signature
      )
        throw new Error('The inputs or destination changed. Review again.');
      for (const prepared of review.reviews) {
        const job = await apiRendersApi.createJob({
          confirmationToken: prepared.confirmationToken,
        });
        submitted.push(job.id);
        const current = useStudioStore.getState();
        if (current.brandId === review.brandId && current.activeRoomId === review.roomId) {
          const existing = current.getNodeById(id)?.data as ApiRenderNodeData | undefined;
          current.updateNodeData(id, {
            latestJobId: job.id,
            jobIds: [...new Set([...(existing?.jobIds ?? []), job.id])],
          });
          current.triggerSave();
        }
      }
      setError(null);
    } catch (cause) {
      setError(
        `${cause instanceof Error ? cause.message : 'Delivery submission failed.'}${submitted.length ? ` ${submitted.length} jobs were submitted; check render history before trying again.` : ' Check render history before retrying if the connection was lost.'}`,
      );
    } finally {
      setBusy(false);
    }
  };
  if (!data.deliveryEnabled) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">
        Workflow runs save files to Library. This review starts a separate render and creates paused
        Meta ads in the selected campaign and ad set.
      </p>
      <Button variant="outline" disabled={busy} onClick={review}>
        {busy ? 'Checking…' : 'Review render and Meta delivery'}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Render and create paused ads?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.reviews.length} render records. Review every destination before confirming.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ol className="max-h-80 space-y-3 overflow-auto text-xs">
            {pending?.reviews.map((item, index) => (
              <li key={index}>
                {item.template.displayName ?? item.template.name}
                <br />
                Account {item.target?.adAccountId} · campaign {item.target?.campaignId} · ad set{' '}
                {item.target?.adsetId}
                <br />
                <dl>
                  {Object.entries(item.renderInput ?? {}).map(([key, value]) => (
                    <div key={key} className="py-1">
                      <dt className="font-medium">{key}</dt>
                      <dd className="break-words">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
                <br />
                Expires {item.expiresAt}
              </li>
            ))}
          </ol>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={confirm}>
              Confirm render and delivery
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
