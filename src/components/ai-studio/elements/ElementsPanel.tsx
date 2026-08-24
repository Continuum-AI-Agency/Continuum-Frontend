'use client';

// The Elements panel — the brand's saved subjects, grouped by category, draggable
// onto the canvas.
//
// One sheet, three views: the list, the create form, and one Element's detail. They
// share the query and the four mutations so a regenerate in the detail refreshes the
// list behind it.

import { Layers, Plus } from 'lucide-react';
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ELEMENT_CATEGORIES,
  ELEMENT_CATEGORY_LABEL,
  ELEMENT_CEILING_COPY,
  type ElementCategory,
  type ElementRecord,
  elementDefaultReferenceAssetId,
  useElementMutations,
  useElements,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';
import { buildElementDragPayload, ELEMENT_DRAG_TYPE } from '@/lib/ai-studio/referenceDrop';
import { ElementCreateForm, type ElementMemberUploader } from './ElementCreateForm';
import { ElementDetail } from './ElementDetail';

export interface ElementsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId?: string;
  /** Injected in tests; the real seam is the library upload edge function. */
  uploadAsset?: ElementMemberUploader;
}

type PanelView = { kind: 'list' } | { kind: 'create' } | { kind: 'detail'; elementId: string };

export function ElementsPanel({ open, onOpenChange, brandId, uploadAsset }: ElementsPanelProps) {
  const [view, setView] = React.useState<PanelView>({ kind: 'list' });
  const { elements, isLoading, isError, error } = useElements(brandId);
  const mutations = useElementMutations(brandId);

  const selected =
    view.kind === 'detail' ? elements.find((item) => item.id === view.elementId) : undefined;

  // An Element deleted while its detail is open must not strand the panel on a blank
  // pane; fall back to the list.
  React.useEffect(() => {
    if (view.kind === 'detail' && !isLoading && !selected) setView({ kind: 'list' });
  }, [view, isLoading, selected]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* z-[110] beats the canvas header's `relative z-[100]`: the header's parent
            establishes no stacking context, so a body-portalled z-50 sheet would paint
            UNDER the toolbar it was opened from. */}
      <SheetContent side="right" className="z-[110] w-[26rem] max-w-full gap-0 px-4 py-5">
        <SheetHeader className="px-0">
          <SheetTitle>Elements</SheetTitle>
          <SheetDescription>{ELEMENT_CEILING_COPY}</SheetDescription>
        </SheetHeader>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-2">
          {!brandId ? (
            <p className="text-sm text-muted-foreground">Select a brand to use Elements.</p>
          ) : view.kind === 'create' ? (
            <ElementCreateForm
              brandId={brandId}
              uploadAsset={uploadAsset}
              isSaving={mutations.create.isPending}
              onCancel={() => setView({ kind: 'list' })}
              onSubmit={(input) =>
                mutations.create.mutate(input, {
                  onSuccess: (created) => setView({ kind: 'detail', elementId: created.id }),
                })
              }
            />
          ) : selected ? (
            <ElementDetail
              // Remount per Element: the guidelines/rights fields are local edit state
              // and must not carry over from the Element that was open before.
              key={selected.id}
              element={selected}
              brandId={brandId}
              isGenerating={mutations.generateReference.isPending}
              isSaving={mutations.update.isPending}
              onBack={() => setView({ kind: 'list' })}
              onGenerateReference={() => mutations.generateReference.mutate(selected.id)}
              onSetDefaultReference={(assetId) =>
                mutations.setDefaultReference.mutate({ elementId: selected.id, assetId })
              }
              onSave={(input) => mutations.update.mutate({ elementId: selected.id, input })}
            />
          ) : (
            <ElementList
              brandId={brandId}
              elements={elements}
              isLoading={isLoading}
              isError={isError}
              error={error}
              onCreate={() => setView({ kind: 'create' })}
              onSelect={(elementId) => setView({ kind: 'detail', elementId })}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ElementList({
  brandId,
  elements,
  isLoading,
  isError,
  error,
  onCreate,
  onSelect,
}: {
  brandId: string;
  elements: ElementRecord[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onCreate: () => void;
  onSelect: (elementId: string) => void;
}) {
  const previewUrls = useSignedAssetUrls(
    brandId,
    elements
      .map((element) => elementDefaultReferenceAssetId(element) ?? element.members[0]?.assetId)
      .filter((assetId): assetId is string => Boolean(assetId)),
  );

  const grouped = ELEMENT_CATEGORIES.map((category) => ({
    category,
    items: elements.filter((element) => element.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" size="sm" className="self-start" onClick={onCreate}>
        <Plus className="mr-2 h-4 w-4" />
        New Element
      </Button>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Elements…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">{error?.message ?? 'Failed to load Elements'}</p>
      ) : elements.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>No Elements yet</EmptyTitle>
            <EmptyDescription>
              Save a model, product or style once and reuse it across every generation.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        grouped.map((group) => (
          <div key={group.category} className="flex flex-col gap-2">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {ELEMENT_CATEGORY_LABEL[group.category as ElementCategory]}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {group.items.map((element) => (
                <ElementCard
                  key={element.id}
                  element={element}
                  previewUrl={
                    previewUrls[
                      elementDefaultReferenceAssetId(element) ?? element.members[0]?.assetId ?? ''
                    ]
                  }
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ElementCard({
  element,
  previewUrl,
  onSelect,
}: {
  element: ElementRecord;
  previewUrl?: string;
  onSelect: (elementId: string) => void;
}) {
  return (
    <button
      type="button"
      draggable
      data-testid={`element-card-${element.id}`}
      onClick={() => onSelect(element.id)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(
          ELEMENT_DRAG_TYPE,
          buildElementDragPayload({
            elementId: element.id,
            name: element.name,
            category: element.category,
            previewUrl,
          }),
        );
      }}
      className="flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-left transition-shadow hover:shadow-md"
    >
      <div className="flex aspect-square w-full items-center justify-center bg-muted/30">
        {previewUrl ? (
          // biome-ignore lint/performance/noImgElement: signed storage URL, not a build-time asset.
          <img src={previewUrl} alt={element.name} className="h-full w-full object-cover" />
        ) : (
          <Layers className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <span className="truncate text-xs">{element.name}</span>
        {element.defaultReferenceAssetId ? null : (
          <Badge variant="outline" className="h-4 shrink-0 px-1 text-3xs">
            no ref
          </Badge>
        )}
      </div>
    </button>
  );
}
