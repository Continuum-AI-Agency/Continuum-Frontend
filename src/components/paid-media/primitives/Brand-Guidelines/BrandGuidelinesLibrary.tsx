'use client';

import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Pill, type PillProps } from '@/components/kibo-ui/pill';
import { Button } from '@/components/ui/button';
import type { BrandGuidelineStatus, BrandGuidelineSummary } from '@/lib/schemas/brandGuidelines';

const STATUS_PILL_VARIANT: Record<BrandGuidelineStatus, PillProps['variant']> = {
  draft: 'muted',
  review: 'warning',
  approved: 'success',
  archived: 'destructive',
};

type BrandGuidelinesLibraryProps = {
  guidelines: BrandGuidelineSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
  isLoading?: boolean;
};

export function BrandGuidelinesLibrary({
  guidelines,
  activeId,
  onSelect,
  onCreateNew,
  isLoading = false,
}: BrandGuidelinesLibraryProps) {
  const uiText = useTranslations('scale');
  const uiLocale = useLocale();
  return (
    <div className="glass-panel h-full rounded-lg p-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-lg font-semibold text-white">
            {uiText('guidelines_library_2351587')}
          </h4>
          <Button size="sm" onClick={onCreateNew}>
            <Plus />
            {uiText('new_18fdd54')}
          </Button>
        </div>
        <span className="text-sm text-muted-foreground">
          {uiText('purpose_driven_brand_guideline_sets_create_on_aadb78c')}
        </span>
        {isLoading ? (
          <span className="text-sm text-muted-foreground">
            {uiText('loading_guidelines_239ef13')}
          </span>
        ) : guidelines.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--glass-border)] p-4">
            <span className="text-sm text-muted-foreground">
              {uiText('no_guidelines_yet_create_a_new_guideline_to_g_d33e62d')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {guidelines.map((guideline) => {
              const isActive = guideline.id === activeId;
              return (
                <button
                  key={guideline.id}
                  type="button"
                  onClick={() => onSelect(guideline.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary ${
                    isActive
                      ? 'border-brand-primary/60 bg-brand-primary/10'
                      : 'border-[var(--glass-border)] hover:border-brand-primary/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{guideline.purpose}</span>
                    <Pill variant={STATUS_PILL_VARIANT[guideline.status]}>{guideline.status}</Pill>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {uiText.rich('sentence_6f34daf78edd', { v0: guideline.version })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {uiText.rich('sentence_5f1f7fcaedd2', {
                        v0: () => new Date(guideline.updatedAt).toLocaleDateString(uiLocale),
                      })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
