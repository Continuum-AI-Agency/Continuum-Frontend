'use client';

// The Layers tab of a template imported from a Photoshop or Illustrator file: the file's own stack,
// and the approved arrangements — the same layers in another front-to-back order. The server
// re-authors each arrangement as its own comp of this template, so a render row picks it like a
// format. Every layer carries its masks and clipping in its own pixels, so any order is safe.

import {
  type DesignArrangement,
  type DesignLayersResponse,
  readableLayerName,
} from '@continuum/contracts';
import {
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  Trash2,
  Type,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Pill } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/components/ui/toast-imperative';
import { fetchDesignLayers, saveDesignArrangements } from '@/lib/library/templateSources';

type Layers = DesignLayersResponse;
type Board = Layers['artboards'][number];

/** An artboard's own stack, bottom first — what a new arrangement starts from and Reset returns to. */
const fileOrder = (layers: Layers, board: Board) =>
  layers.layers.filter((layer) => layer.artboardId === board.id).map((layer) => layer.id);

/** `order` with one layer moved one step toward the viewer (+1) or away from them (−1). */
export function moveLayer(order: readonly number[], id: number, step: 1 | -1): number[] {
  const at = order.indexOf(id);
  const to = at + step;
  if (at < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[at], next[to]] = [next[to] as number, next[at] as number];
  return next;
}

function StackList({
  layers,
  order,
  onMove,
}: {
  layers: Layers;
  order: readonly number[];
  onMove?: (id: number, step: 1 | -1) => void;
}) {
  const byId = new Map(layers.layers.map((layer) => [layer.id, layer]));
  // Shown front first, the way a layers panel reads.
  const front = [...order].reverse();
  return (
    <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
      {front.map((id, index) => {
        const layer = byId.get(id);
        if (!layer) return null;
        const name = readableLayerName(layer.name) || layer.name;
        return (
          <li key={id} className="flex items-center gap-2 px-2 py-1 text-xs">
            {layer.kind === 'text' ? (
              <Type className="size-3.5 text-muted-foreground" aria-hidden />
            ) : (
              <ImageIcon className="size-3.5 text-muted-foreground" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate">{name}</span>
            {layer.hidden ? <Pill variant="muted">Hidden in the file</Pill> : null}
            {onMove ? (
              <span className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Bring ${name} forward`}
                  disabled={index === 0}
                  onClick={() => onMove(id, 1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Send ${name} backward`}
                  disabled={index === front.length - 1}
                  onClick={() => onMove(id, -1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function DesignLayersPanel({
  brandId,
  assetId,
  active,
  onSaved,
}: {
  brandId: string;
  assetId: string;
  /** Reading the layers opens the source file, so it waits until the tab is first shown. */
  active: boolean;
  onSaved: () => Promise<unknown> | unknown;
}) {
  const [layers, setLayers] = useState<Layers | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [draft, setDraft] = useState<DesignArrangement[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!active || layers || refusal) return;
    let cancelled = false;
    fetchDesignLayers(brandId, assetId)
      .then((read) => {
        if (cancelled) return;
        setLayers(read);
        setDraft(read.arrangements);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setRefusal(error instanceof Error ? error.message : 'Could not read the layers');
      });
    return () => {
      cancelled = true;
    };
  }, [active, assetId, brandId, layers, refusal]);

  if (refusal) return <p className="text-xs text-muted-foreground">{refusal}</p>;
  if (!layers)
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading the file’s layers…
      </p>
    );

  const boardOf = (arrangement: DesignArrangement) =>
    layers.artboards.find((board) => board.id === arrangement.artboardId) ?? layers.artboards[0];
  const changed = JSON.stringify(draft) !== JSON.stringify(layers.arrangements);
  const update = (index: number, patch: Partial<DesignArrangement>) =>
    setDraft((current) => current.map((item, at) => (at === index ? { ...item, ...patch } : item)));

  const addArrangement = () => {
    const board = layers.artboards[0];
    if (!board) return;
    setDraft((current) => [
      ...current,
      {
        name: `${board.name} · ${current.length + 2}`.slice(0, 60),
        artboardId: board.id,
        order: fileOrder(layers, board),
      },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveDesignArrangements(brandId, assetId, draft);
      setLayers({ ...layers, arrangements: saved.arrangements });
      setDraft(saved.arrangements);
      toast.success(
        `Saved as the template’s next revision (${saved.comps.length} comps). Publish it to render the arrangements.`,
      );
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the arrangements');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        An arrangement is the same layers in another front-to-back order. Each one becomes a format
        a render row can pick. Masks and clipping travel with each layer, so any order is safe.
      </p>

      {layers.artboards.map((board) => (
        <section key={board.id ?? 'canvas'} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium">
            {board.name} · as the file stacks it{' '}
            <span className="font-normal text-muted-foreground">
              {board.w}×{board.h}
            </span>
          </h3>
          <StackList layers={layers} order={fileOrder(layers, board)} />
        </section>
      ))}

      {draft.map((arrangement, index) => {
        const board = boardOf(arrangement);
        return (
          <section
            // biome-ignore lint/suspicious/noArrayIndexKey: an arrangement's name is what is being edited.
            key={index}
            aria-label={`Arrangement ${arrangement.name}`}
            className="flex flex-col gap-1.5 rounded-md border border-border p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Arrangement name"
                className="h-7 w-56 text-xs"
                value={arrangement.name}
                maxLength={60}
                onChange={(event) => update(index, { name: event.target.value })}
              />
              {layers.artboards.length > 1 && board ? (
                <Select
                  value={String(board.id)}
                  onValueChange={(next) => {
                    const picked = layers.artboards.find((item) => String(item.id) === next);
                    if (picked)
                      update(index, { artboardId: picked.id, order: fileOrder(layers, picked) });
                  }}
                >
                  <SelectTrigger size="sm" aria-label="Artboard it re-stacks">
                    <SelectValue>{board.name}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {layers.artboards.map((item) => (
                      <SelectItem key={item.id ?? 'canvas'} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => board && update(index, { order: fileOrder(layers, board) })}
              >
                <RotateCcw data-icon="inline-start" aria-hidden /> Reset to the file’s order
              </Button>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-label={`Remove ${arrangement.name}`}
                onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
            <StackList
              layers={layers}
              order={arrangement.order}
              onMove={(id, step) =>
                update(index, { order: moveLayer(arrangement.order, id, step) })
              }
            />
          </section>
        );
      })}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={addArrangement}>
          <Plus data-icon="inline-start" aria-hidden /> New arrangement
        </Button>
        <Button type="button" size="sm" disabled={!changed || saving} onClick={save}>
          {saving ? (
            <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden />
          ) : null}
          Save arrangements
        </Button>
        {changed ? (
          <span className="text-xs text-muted-foreground">
            Saving re-authors the template as its next revision.
          </span>
        ) : null}
      </div>
    </div>
  );
}
