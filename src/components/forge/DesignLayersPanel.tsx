'use client';

// Arrangements of a template imported from a Photoshop or Illustrator file: the same layers in
// another front-to-back order, each re-authored by the server as its own comp so a render row picks
// it like a format. Every layer carries its masks and clipping in its own pixels, so any order is
// safe. The import itself is the golden source: arrangements saved on it land in a new variant, and
// re-arranging a variant writes that variant's next revision. Renders nothing for other templates.

import type {
  DesignArrangement,
  DesignArrangementsResponse,
  DesignLayersResponse,
} from '@continuum/contracts';
import { readableLayerName } from '@continuum/contracts';
import { ChevronDown, Loader2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { type StackRow, TemplateLayerList } from '@/components/forge/TemplateLayerList';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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

/** A bottom-first order as the list's front-first rows. */
function rowsOf(layers: Layers, order: readonly number[]): StackRow[] {
  const byId = new Map(layers.layers.map((layer) => [layer.id, layer]));
  return [...order].reverse().flatMap((id) => {
    const layer = byId.get(id);
    if (!layer) return [];
    return [
      {
        id,
        label: readableLayerName(layer.name) || layer.name,
        kind: layer.kind === 'text' ? ('text' as const) : ('artwork' as const),
        hidden: layer.hidden,
      },
    ];
  });
}

export function DesignLayersPanel({
  brandId,
  assetId,
  onVariant,
  onSaved,
  onOpenVariant,
}: {
  brandId: string;
  assetId: string;
  /** The open template is a variant: Save writes it. On the golden import, saving forks. */
  onVariant: boolean;
  onSaved: () => Promise<unknown> | unknown;
  onOpenVariant?: (assetId: string) => void;
}) {
  // Reading the layers opens the Photoshop or Illustrator file, so it waits for the first expand.
  const [open, setOpen] = useState(false);
  const [layers, setLayers] = useState<Layers | null | undefined>(undefined);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [draft, setDraft] = useState<DesignArrangement[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || layers !== undefined || refusal) return;
    let cancelled = false;
    fetchDesignLayers(brandId, assetId)
      .then((read) => {
        if (cancelled) return;
        setLayers(read);
        setDraft(read?.arrangements ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setRefusal(error instanceof Error ? error.message : 'Could not read the layers');
      });
    return () => {
      cancelled = true;
    };
  }, [open, assetId, brandId, layers, refusal]);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-border bg-card"
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
        <span>
          <span className="block text-sm font-medium">Arrangements · extra formats</span>
          <span className="block text-xs text-muted-foreground">
            The same layers in another front-to-back order, each one a format a render row can pick.
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180"
          aria-hidden
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 border-t border-border p-3">
        {layers ? (
          <Arrangements
            layers={layers}
            setLayers={setLayers}
            draft={draft}
            setDraft={setDraft}
            name={name}
            setName={setName}
            saving={saving}
            setSaving={setSaving}
            onVariant={onVariant}
            save={(saveTo) =>
              saveDesignArrangements(brandId, assetId, {
                arrangements: draft,
                saveTo,
                ...(saveTo === 'new_variant' ? { name: name.trim() } : {}),
              })
            }
            onSaved={onSaved}
            onOpenVariant={onOpenVariant}
          />
        ) : refusal ? (
          <p className="text-xs text-muted-foreground">{refusal}</p>
        ) : layers === null ? (
          <p className="text-xs text-muted-foreground">This template has no design arrangements.</p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Reading the file’s layers…
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function Arrangements({
  layers,
  setLayers,
  draft,
  setDraft,
  name,
  setName,
  saving,
  setSaving,
  onVariant,
  save: send,
  onSaved,
  onOpenVariant,
}: {
  layers: Layers;
  setLayers: (layers: Layers) => void;
  draft: DesignArrangement[];
  setDraft: Dispatch<SetStateAction<DesignArrangement[]>>;
  name: string;
  setName: (name: string) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onVariant: boolean;
  save: (saveTo: 'new_variant' | 'this_variant') => Promise<DesignArrangementsResponse>;
  onSaved: () => Promise<unknown> | unknown;
  onOpenVariant?: (assetId: string) => void;
}) {
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

  const save = async (saveTo: 'new_variant' | 'this_variant') => {
    if (saveTo === 'new_variant' && !name.trim()) {
      toast.error('Name the variant these arrangements are saved to.');
      return;
    }
    setSaving(true);
    try {
      const saved = await send(saveTo);
      if (saveTo === 'this_variant') {
        setLayers({ ...layers, arrangements: saved.arrangements });
        setDraft(saved.arrangements);
        toast.success(
          `Saved to this variant (${saved.comps.length} comps). Publish it to render the arrangements.`,
        );
        await onSaved();
        return;
      }
      setDraft(layers.arrangements);
      setName('');
      toast.success(`Saved as a new variant (${saved.comps.length} comps).`);
      await onSaved();
      onOpenVariant?.(saved.assetId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the arrangements');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid max-h-[32rem] gap-3 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
        {layers.artboards.map((board) => (
          <section
            key={board.id ?? 'canvas'}
            className="flex flex-col gap-1.5 rounded-md border border-border p-2"
          >
            <h4 className="text-xs font-medium">
              {board.name} · as the file stacks it{' '}
              <span className="font-normal text-muted-foreground">
                {board.w}×{board.h}
              </span>
            </h4>
            <TemplateLayerList
              label={`${board.name} as the file stacks it`}
              rows={rowsOf(layers, fileOrder(layers, board))}
            />
          </section>
        ))}

        {draft.map((arrangement, index) => {
          const board = boardOf(arrangement);
          return (
            <section
              // biome-ignore lint/suspicious/noArrayIndexKey: an arrangement's name is what is being edited.
              key={index}
              aria-label={`Arrangement ${arrangement.name}`}
              className="flex flex-col gap-1.5 rounded-md border border-primary/30 p-2"
            >
              <div className="flex flex-wrap items-center gap-1">
                <Input
                  aria-label="Arrangement name"
                  className="h-7 min-w-0 flex-1 text-xs"
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
                        update(index, {
                          artboardId: picked.id,
                          order: fileOrder(layers, picked),
                        });
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
                  size="icon-xs"
                  variant="ghost"
                  aria-label="Reset to the file’s order"
                  onClick={() => board && update(index, { order: fileOrder(layers, board) })}
                >
                  <RotateCcw aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${arrangement.name}`}
                  onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              <TemplateLayerList
                label={`${arrangement.name} stack`}
                rows={rowsOf(layers, arrangement.order)}
                onReorder={(front) => update(index, { order: [...front].reverse() })}
              />
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button type="button" size="sm" variant="outline" onClick={addArrangement}>
          <Plus data-icon="inline-start" aria-hidden /> New arrangement
        </Button>
        <div className="flex-1" />
        <Input
          aria-label="Arrangement variant name"
          placeholder="Name the new variant"
          className="h-8 w-56 text-xs"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
        {onVariant ? (
          <Button
            type="button"
            size="sm"
            disabled={!changed || saving}
            onClick={() => void save('this_variant')}
          >
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            Save arrangements
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={onVariant ? 'outline' : 'default'}
          disabled={!draft.length || saving || !name.trim()}
          onClick={() => void save('new_variant')}
        >
          {saving && !onVariant ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : null}
          Save as new variant
        </Button>
      </div>
    </>
  );
}
