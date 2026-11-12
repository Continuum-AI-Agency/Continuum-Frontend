'use client';

import { Layers, Plus } from 'lucide-react';
import { useTranslations as useUiTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ElementCard } from '@/components/ai-studio/elements/ElementCard';
import { ElementsPanel } from '@/components/ai-studio/elements/ElementsPanel';
import { elementCategoryLabel } from '@/components/ai-studio/elements/elementPresentation';
import { Button } from '@/components/ui/button';
import {
  ELEMENT_CATEGORIES,
  elementDefaultReferenceAssetId,
  useElements,
  useSignedAssetUrls,
} from '@/lib/ai-studio/elements';

export function LibraryElementsGrid({ brandId }: { brandId: string }) {
  const translateUi = useUiTranslations('library');
  const elementText = useUiTranslations('studio');

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
          {' '}
          {translateUi('droppable_onto_canvas_and_pipeline__de0c4d4b')}{' '}
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
          <Plus className="size-4" /> {translateUi('new_element_45e3dc5d')}{' '}
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">{translateUi('loading_elements_f4e8a467')}</p>
      ) : isError ? (
        <p className="text-sm text-destructive">
          {error?.message ?? translateUi('failed_to_load_elements_2559d3d4')}
        </p>
      ) : elements.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {' '}
          {translateUi('no_elements_yet_select_images_and_u_4ebcae2f')}{' '}
        </p>
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {elementCategoryLabel(group.category, elementText)}
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
