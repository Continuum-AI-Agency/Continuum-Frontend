'use client';

// Arrangements of a template imported from a Photoshop or Illustrator file: the same layers in
// another front-to-back order, each re-authored by the server as its own comp so a render row picks
// it like a format. Every layer carries its masks and clipping in its own pixels, so any order is
// safe. The import itself is the golden source: arrangements saved on it land in a new variant, and
// re-arranging a variant writes that variant's next revision. Renders nothing for other templates.

import type {
  DesignArrangement,
  DesignLayersResponse,
  TemplateRevision,
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
import { fetchDesignLayers, saveTemplateRevision } from '@/lib/library/templateSources';

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
  revisionId,
  expectedHeadRevisionId,
  variantId,
  onSaved,
}: {
  brandId: string;
  assetId: string;
  /** Exact immutable revision used as both the parent and expected variant head. */
  revisionId: string;
  expectedHeadRevisionId: string;
  /** Omit for the golden source; provide the stable variant ID to append an immutable revision. */
  variantId?: string;
  onSaved: (revision: TemplateRevision) => Promise<unknown> | unknown;
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
            draft={draft}
            setDraft={setDraft}
            name={name}
            setName={setName}
            saving={saving}
            setSaving={setSaving}
            variantId={variantId}
            save={(arrangement) =>
              saveTemplateRevision(assetId, {
                brandId,
                parentRevisionId: revisionId,
                expectedHeadRevisionId,
                idempotencyKey: crypto.randomUUID(),
                ...(variantId ? { variantId } : { name: arrangement.name }),
                edits: {
                  arrangement,
                  layers: [],
                  slots: [],
                  orders: [],
                },
              })
            }
            onSaved={onSaved}
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
  draft,
  setDraft,
  name,
  setName,
  saving,
  setSaving,
  variantId,
  save: send,
  onSaved,
}: {
  layers: Layers;
  draft: DesignArrangement[];
  setDraft: Dispatch<SetStateAction<DesignArrangement[]>>;
  name: string;
  setName: (name: string) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  variantId?: string;
  save: (arrangement: DesignArrangement) => Promise<TemplateRevision>;
  onSaved: (revision: TemplateRevision) => Promise<unknown> | unknown;
}) {
  const [selected, setSelected] = useState(0);
  const boardOf = (arrangement: DesignArrangement) =>
    layers.artboards.find((board) => board.id === arrangement.artboardId) ?? layers.artboards[0];
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
    const arrangement = draft[selected];
    if (!arrangement) {
      toast.error('Create or select an arrangement first.');
      return;
    }
    if (!variantId && !name.trim()) {
      toast.error('Name the new variant.');
      return;
    }
    setSaving(true);
    let saved: TemplateRevision;
    try {
      saved = await send({ ...arrangement, name: variantId ? arrangement.name : name.trim() });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the arrangement');
      setSaving(false);
      return;
    } finally {
      setSaving(false);
    }
    if (!variantId) setName('');
    toast.success(variantId ? 'Saved a new immutable revision.' : 'Created an immutable variant revision.');
    await onSaved(saved);
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
                onReorder={(front) =>
                  update(index, { order: front.filter((id): id is number => typeof id === 'number').reverse() })
                }
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
        <Select
          value={String(Math.min(selected, Math.max(0, draft.length - 1)))}
          onValueChange={(value) => setSelected(Number(value))}
          disabled={!draft.length || saving}
        >
          <SelectTrigger size="sm" aria-label="Arrangement to save">
            <SelectValue>{draft[Math.min(selected, draft.length - 1)]?.name ?? 'No arrangement'}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {draft.map((item, index) => (
              <SelectItem key={`${item.name}:${index}`} value={String(index)}>{item.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!variantId ? (
          <Input
            aria-label="Arrangement variant name"
            placeholder="Name the new variant"
            className="h-8 w-56 text-xs"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={variantId ? 'default' : 'outline'}
          disabled={!draft.length || saving || (!variantId && !name.trim())}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          {variantId ? 'Save arrangement revision' : 'Save as immutable variant'}
        </Button>
      </div>
    </>
  );
}
