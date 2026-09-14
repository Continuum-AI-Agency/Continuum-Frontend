'use client';

import { Layers, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ElementCard } from '@/components/ai-studio/elements/ElementCard';
import { ElementsPanel } from '@/components/ai-studio/elements/ElementsPanel';
import { Button } from '@/components/ui/button';
import {
  ELEMENT_CATEGORIES,
  ELEMENT_CATEGORY_LABEL,
  elementDefaultReferenceAssetId,
  useElements,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';

export function LibraryElementsGrid({ brandId }: { brandId: string }) {
  const { elements, isLoading, isError, error } = useElements(brandId);
  const [panelOpen, setPanelOpen] = useState(false);
  const [initialView, setInitialView] = useState<'list' | 'create'>('list');
  const [initialElementId, setInitialElementId] = useState<string | undefined>();
  const previewIds = useMemo(
    () =>
      elements
        .map((element) => elementDefaultReferenceAssetId(element) ?? element.members[0]?.assetId)
        .filter((assetId): assetId is string => Boolean(assetId)),
    [elements],
  );
  const previewUrls = useSignedAssetUrls(brandId, previewIds);
  const grouped = ELEMENT_CATEGORIES.map((category) => ({
    category,
    items: elements.filter((element) => element.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Droppable onto canvas and pipeline ports. Save a model, product or style once.
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setInitialElementId(undefined);
            setInitialView('create');
            setPanelOpen(true);
          }}
        >
          <Plus className="size-4" />
          New Element
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading Elements…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">{error?.message ?? 'Failed to load Elements'}</p>
      ) : elements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No Elements yet. Select images and use Mark as Element, or create one here.
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {ELEMENT_CATEGORY_LABEL[group.category]}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {group.items.map((element) => (
                <ElementCard
                  key={element.id}
                  element={element}
                  previewUrl={
                    previewUrls[
                      elementDefaultReferenceAssetId(element) ?? element.members[0]?.assetId ?? ''
                    ]
                  }
                  onSelect={(id) => {
                    setInitialView('list');
                    setInitialElementId(id);
                    setPanelOpen(true);
                  }}
                />
              ))}
            </div>
          </section>
        ))
      )}
      <ElementsPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        brandId={brandId}
        initialView={initialView}
        initialElementId={initialElementId}
      />
    </div>
  );
}
