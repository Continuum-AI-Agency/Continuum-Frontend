'use client';

// Turns a canvas selection into a reusable Technique.
//
// A starter (SaveStarterDialog) is a recipe you re-run; a Technique is a PIECE
// you drop into work already in progress. The difference is the port contract:
// this dialog reads the selection's boundary and records what the piece takes
// and gives back, so a picker can say "1 image in, 1 image out" before you
// place it and a later collapsed node has something to draw handles from.
//
// The save itself rides the exact workflow pipeline the starter uses — the
// serializer's blocklist keeps model, prompts, skillIds and reference roles
// intact — with `metadata.technique` in place of `metadata.starter`.

import { canvasTechniqueMetadataSchema, type WorkflowFragmentKind } from '@continuum/contracts';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { throwToastError, useToast } from '@/components/ui/ToastProvider';
import { Textarea } from '@/components/ui/textarea';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { brandTechniquesQueryKey } from '@/lib/ai-studio/techniques';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { inferTechniquePorts, suggestTechniqueKind } from '../utils/techniqueFragment';
import { serializeWorkflowSnapshot } from '../utils/workflowSerialization';

const TECHNIQUE_PAYLOAD_MAX_BYTES = 200 * 1024 * 1024;

const KIND_LABELS: Record<WorkflowFragmentKind, string> = {
  reference: 'Reference — material another step consumes',
  generation: 'Generation — makes new media',
  transformation: 'Transformation — reshapes what it is given',
  assembly: 'Assembly — composes pieces into one output',
  delivery: 'Delivery — publishes or hands off',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandProfileId?: string;
  nodes: StudioNode[];
};

const portSummary = (ports: { label?: string; dataType?: string }[]): string =>
  ports.length === 0
    ? 'none'
    : ports.map((port) => `${port.label ?? 'Port'} (${port.dataType ?? 'any'})`).join(' · ');

export function SaveTechniqueDialog({ open, onOpenChange, brandProfileId, nodes }: Props) {
  const { edges, defaultEdgeType } = useStudioStore();
  const { show } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [kind, setKind] = React.useState<WorkflowFragmentKind>('generation');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Only the edges wholly inside the selection travel with the technique, so a
  // captured piece re-applies without dangling connections. The FULL edge list
  // is what the inference reads — a boundary is only visible from both sides.
  const selectedEdges = React.useMemo(() => {
    const ids = new Set(nodes.map((node) => node.id));
    return edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  }, [nodes, edges]);

  const inference = React.useMemo(() => inferTechniquePorts(nodes, edges), [nodes, edges]);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setError(null);
      return;
    }
    setKind(suggestTechniqueKind(nodes));
  }, [open, nodes]);

  const hasNodes = nodes.length > 0;
  const canSave = name.trim().length > 0 && hasNodes && !isSaving;

  const save = React.useCallback(async () => {
    if (!brandProfileId || !canSave) return;
    setIsSaving(true);
    setError(null);
    try {
      const snapshot = serializeWorkflowSnapshot(nodes, selectedEdges, defaultEdgeType);
      const payloadBytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
      if (payloadBytes > TECHNIQUE_PAYLOAD_MAX_BYTES) {
        throwToastError({
          title: 'Technique too large to save',
          description: `${formatMiB(payloadBytes)} (max ${formatMiB(TECHNIQUE_PAYLOAD_MAX_BYTES)}). Remove large media inputs.`,
          variant: 'error',
        });
      }

      // Validated here rather than trusted: a bad inference should fail in front
      // of the person who can fix the selection, not persist a broken contract.
      const technique = canvasTechniqueMetadataSchema.parse({
        version: 1,
        kind,
        inputPorts: inference.inputPorts,
        outputPorts: inference.outputPorts,
      });

      await createAiStudioWorkflowAction({
        brandProfileId,
        name: name.trim(),
        description: description.trim() || undefined,
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        metadata: { technique },
      });
      await queryClient.invalidateQueries({ queryKey: brandTechniquesQueryKey(brandProfileId) });
      show({
        title: 'Technique saved',
        description: `"${name.trim()}" can be dropped onto any canvas.`,
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the technique. Try again.');
    } finally {
      setIsSaving(false);
    }
  }, [
    brandProfileId,
    canSave,
    nodes,
    selectedEdges,
    defaultEdgeType,
    inference,
    kind,
    name,
    description,
    queryClient,
    show,
    onOpenChange,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="save-technique-dialog">
        <DialogHeader>
          <DialogTitle>Save selection as technique</DialogTitle>
          <DialogDescription>
            Save the selected nodes as a reusable piece. Its inputs and outputs are read from where
            the selection&apos;s edges cross the boundary, so you can drop it into any canvas and
            wire it up.
          </DialogDescription>
        </DialogHeader>

        {!hasNodes ? (
          <p className="py-4 text-sm text-muted-foreground">
            Select the nodes you want to reuse, then try again.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="technique-name">Name</Label>
              <Input
                id="technique-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                placeholder="e.g. Palette smash-up"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="technique-kind">Kind</Label>
              <Select value={kind} onValueChange={(next) => setKind(next as WorkflowFragmentKind)}>
                <SelectTrigger id="technique-kind">
                  <SelectValue items={KIND_LABELS} />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="technique-description">Description</Label>
              <Textarea
                id="technique-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder="Optional notes on when to reach for this technique"
              />
            </div>

            <div
              className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground"
              data-testid="technique-ports"
            >
              <p>
                <span className="font-medium text-foreground">Takes:</span>{' '}
                {portSummary(inference.inputPorts)}
              </p>
              <p>
                <span className="font-medium text-foreground">Gives:</span>{' '}
                {portSummary(inference.outputPorts)}
              </p>
              {inference.truncated && (
                <p className="mt-1 text-amber-600 dark:text-amber-500">
                  More than 12 ports on one side — the extras are not recorded.
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Saving {nodes.length} node{nodes.length === 1 ? '' : 's'} and {selectedEdges.length}{' '}
              connection{selectedEdges.length === 1 ? '' : 's'}.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {!brandProfileId && (
              <p className="text-xs text-muted-foreground">
                Select a brand before saving a technique.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" onClick={() => void save()} disabled={!canSave || !brandProfileId}>
            {isSaving ? 'Saving…' : 'Save technique'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
