'use client';

// Turns a canvas selection into a reusable Technique.
//
// A saved workflow (SaveWorkflowDialog) is a canvas you load; a Technique is a PIECE
// you drop into work already in progress. The difference is the port contract:
// this dialog reads the selection's boundary and records what the piece takes
// and gives back, so a picker can say "1 image in, 1 image out" before you
// place it and a later collapsed node has something to draw handles from.
//
// The save itself rides the exact workflow pipeline a plain save uses — the
// serializer's blocklist keeps model, prompts, skillIds and reference roles
// intact — with `metadata.technique` as the flag.

import { canvasTechniqueMetadataSchema, type WorkflowFragmentKind } from '@continuum/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations as useUiTranslations } from 'next-intl';
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
import { useUiErrorMessage } from '@/i18n/errors';
import { formatMiB } from '@/lib/ai-studio/referenceDrop';
import { brandTechniquesQueryKey } from '@/lib/ai-studio/techniques';
import { createAiStudioWorkflowAction } from '@/lib/ai-studio/workflowActions';
import { useStudioStore } from '../stores/useStudioStore';
import type { StudioNode } from '../types';
import { inferTechniquePorts, suggestTechniqueKind } from '../utils/techniqueFragment';
import { serializeWorkflowSnapshot } from '../utils/workflowSerialization';

const TECHNIQUE_PAYLOAD_MAX_BYTES = 200 * 1024 * 1024;

/**
 * How long a save may hang before the dialog stops waiting on it. The save is ONE
 * insert of one row — nothing legitimate takes half a minute — so a request still
 * unanswered here is a request that is not coming back, and a button reading
 * "Saving…" forever is what that looked like from the outside (Airtable #282).
 *
 * ponytail: a client-side deadline cannot cancel the server, so a save that times
 * out may still have landed. The message says so rather than pretending otherwise;
 * an idempotency key on the insert is the upgrade if duplicates ever show up.
 */
export const TECHNIQUE_SAVE_TIMEOUT_MS = 30_000;

const TIMED_OUT_MESSAGE =
  'The save never came back. It may still have gone through — check Add Node → Techniques before saving again.';

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(TIMED_OUT_MESSAGE)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

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
  /** Test seam for the deadline above; production always takes the default. */
  saveTimeoutMs?: number;
};

const portSummary = (ports: { label?: string; dataType?: string }[]): string =>
  ports.length === 0
    ? 'none'
    : ports.map((port) => `${port.label ?? 'Port'} (${port.dataType ?? 'any'})`).join(' · ');

export function SaveTechniqueDialog({
  open,
  onOpenChange,
  brandProfileId,
  nodes,
  saveTimeoutMs = TECHNIQUE_SAVE_TIMEOUT_MS,
}: Props) {
  const uiErrorText = useUiErrorMessage();

  const translateUi = useUiTranslations('studio');

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
          title: translateUi('technique_too_large_to_save_9b9ddf57'),
          description: translateUi('value0_max_value1_remove_large_medi_bd0ca6a0', {
            value0: String(formatMiB(payloadBytes)),
            value1: String(formatMiB(TECHNIQUE_PAYLOAD_MAX_BYTES)),
          }),
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

      await withDeadline(
        createAiStudioWorkflowAction({
          brandProfileId,
          name: name.trim(),
          description: description.trim() || undefined,
          nodes: snapshot.nodes,
          edges: snapshot.edges,
          metadata: { technique },
        }),
        saveTimeoutMs,
      );

      // The row is saved; the dialog is done. Refreshing the Add Node → Techniques
      // list is the canvas's housekeeping, and AWAITING it here is what left the
      // button on "Saving…" (Airtable #282): StudioCanvas keeps useTechniques mounted
      // for the whole session, so the invalidation always has an active observer and
      // always refetches every workflow the brand owns before resolving.
      void queryClient.invalidateQueries({
        queryKey: brandTechniquesQueryKey(brandProfileId),
      });
      show({
        title: translateUi('technique_saved_45144527'),
        description: translateUi('value0_can_be_dropped_onto_any_canv_366acaca', {
          value0: String(name.trim()),
        }),
        variant: 'success',
      });
      onOpenChange(false);
    } catch (err) {
      setError(uiErrorText(err));
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
    saveTimeoutMs,
    show,
    onOpenChange,

    uiErrorText,
    translateUi,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="save-technique-dialog">
        <DialogHeader>
          <DialogTitle>{translateUi('save_selection_as_technique_c3849b70')}</DialogTitle>
          <DialogDescription>
            {' '}
            {translateUi('save_the_selected_nodes_as_a_reusab_6983a665')}{' '}
          </DialogDescription>
        </DialogHeader>

        {!hasNodes ? (
          <p className="py-4 text-sm text-muted-foreground">
            {' '}
            {translateUi('select_the_nodes_you_want_to_reuse__7a07833a')}{' '}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="technique-name">{translateUi('name_dcd1d522')}</Label>
              <Input
                id="technique-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={160}
                placeholder={translateUi('e_g_palette_smash_up_6b2072c6')}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="technique-kind">{translateUi('kind_f5387f9b')}</Label>
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
              <Label htmlFor="technique-description">{translateUi('description_526e0087')}</Label>
              <Textarea
                id="technique-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                placeholder={translateUi('optional_notes_on_when_to_reach_for_55e351c6')}
              />
            </div>

            <div
              className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground"
              data-testid="technique-ports"
            >
              <p>
                <span className="font-medium text-foreground">{translateUi('takes_6228c88a')}</span>{' '}
                {portSummary(inference.inputPorts)}
              </p>
              <p>
                <span className="font-medium text-foreground">{translateUi('gives_f74fc9fe')}</span>{' '}
                {portSummary(inference.outputPorts)}
              </p>
              {inference.truncated && (
                <p className="mt-1 text-amber-600 dark:text-amber-500">
                  {' '}
                  {translateUi('more_than_12_ports_on_one_side_the__eb9baba8')}{' '}
                </p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {' '}
              {translateUi('saving_096b7362')} {nodes.length} {translateUi('node_545ea538')}
              {nodes.length === 1 ? '' : 's'} {translateUi('and_6201111b')} {selectedEdges.length}{' '}
              {translateUi('connection_b38d9d16')}
              {selectedEdges.length === 1 ? '' : 's'}.
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {!brandProfileId && (
              <p className="text-xs text-muted-foreground">
                {' '}
                {translateUi('select_a_brand_before_saving_a_tech_f3fa31ad')}{' '}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" onClick={() => void save()} disabled={!canSave || !brandProfileId}>
            {isSaving ? translateUi('saving_23e39291') : translateUi('save_technique_89563bd8')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
