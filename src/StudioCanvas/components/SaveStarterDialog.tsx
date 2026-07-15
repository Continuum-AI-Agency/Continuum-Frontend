'use client';

// Turns a canvas-node selection into a reusable "starter" — a re-runnable recipe.
// Unlike the old skill-from-selection flow (which flattened the selection to a text
// paragraph and lost the model/refs/skillIds), this preserves the full subgraph by
// riding the exact workflow-save pipeline: the serializer's blocklist keeps skillIds,
// model, prompts, and reference roles intact, and the row is flagged metadata.starter.

import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { throwToastError, useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { brandStartersQueryKey } from '@/lib/ai-studio/starters';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { serializeWorkflowSnapshot } from '../utils/workflowSerialization';

const STARTER_PAYLOAD_MAX_BYTES = 200 * 1024 * 1024;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandProfileId?: string;
  nodes: StudioNode[];
};

export function SaveStarterDialog({ open, onOpenChange, brandProfileId, nodes }: Props) {
  const { edges, defaultEdgeType } = useStudioStore();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setError(null);
    }
  }, [open]);

  // Only the edges wholly inside the selection travel with the starter, so a captured
  // subgraph re-applies without dangling connections to nodes that were left behind.
  const selectedEdges = React.useMemo(() => {
    const ids = new Set(nodes.map((node) => node.id));
    return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  }, [nodes, edges]);

  const hasNodes = nodes.length > 0;
  const canSave = name.trim().length > 0 && hasNodes && !isSaving;

  const save = React.useCallback(async () => {
    if (!brandProfileId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const snapshot = serializeWorkflowSnapshot(nodes, selectedEdges, defaultEdgeType);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if (payloadBytes > STARTER_PAYLOAD_MAX_BYTES) {
        throwToastError({
          title: 'Starter too large to save',
          description: `${formatMiB(payloadBytes)} (max ${formatMiB(STARTER_PAYLOAD_MAX_BYTES)}). Remove large media inputs.`,
          variant: 'error',
        });
      }
      await createAiStudioWorkflowAction({
        brandProfileId,
        name: name.trim(),
        description: description.trim() || undefined,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        metadata: { starter: true },
      });
      await queryClient.invalidateQueries({ queryKey: brandStartersQueryKey(brandProfileId) });
      show({
        title: 'Starter saved',
        description: `"${name.trim()}" is ready to re-run from the composer.`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the starter. Try again.');
    } finally {
      setIsSaving(false);
    }
  }, [
    brandProfileId,
    canSave,
    nodes,
    selectedEdges,
    defaultEdgeType,
    name,
    description,
    queryClient,
    show,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Save selection as starter</DialogTitle>
          <DialogDescription>
            Save the selected nodes as a re-runnable recipe. Their prompts, models, reference roles,
            and applied skills are kept, so you can drop it onto any canvas and press Run.
          </DialogDescription>
        </DialogHeader>

        {!hasNodes ? (
          <p className="py-4 text-sm text-muted-foreground">
            Select the nodes you want to reuse, then try again.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="starter-name">Name</Label>
              <Input
                id="starter-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                placeholder="e.g. Product hero shot"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="starter-description">Description</Label>
              <Textarea
                id="starter-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Optional notes on when to reach for this starter"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Saving {nodes.length} node{nodes.length === 1 ? '' : 's'} and {selectedEdges.length}{' '}
              connection{selectedEdges.length === 1 ? '' : 's'}.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {!brandProfileId && (
              <p className="text-xs text-muted-foreground">
                Select a brand before saving a starter.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" onClick={() => void save()} disabled={!canSave || !brandProfileId}>
            {isSaving ? 'Saving…' : 'Save starter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
