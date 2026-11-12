'use client';
import { useTranslations } from 'next-intl';

import type { CreativeArtifact } from '@/lib/jaina/schemas';
import { CreativeCard } from './CreativeCard';

type CreativesSectionProps = {
  creatives: CreativeArtifact[];
  onRequestCreative?: (query: string) => void;
  disabled?: boolean;
};

export function CreativesSection({
  creatives,
  onRequestCreative,
  disabled,
}: CreativesSectionProps) {
  const uiText = useTranslations('scale');
  if (creatives.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {uiText.rich('sentence_922110720114', { count: creatives.length })}
      </p>
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {creatives.map((creative, i) => (
          <CreativeCard
            key={creative.id}
            creative={creative}
            index={i}
            onRequestCreative={onRequestCreative}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
