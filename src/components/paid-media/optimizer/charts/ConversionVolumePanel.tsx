'use client';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { createOptimizerDisplayTranslate } from '@/lib/paid-media/optimizerTranslator';

// The conversion-volume panel: the count, the floor, the ad sets under it by name, and what
// the engine says would raise the count it can score on. Replaces the confidence radar.

import type { RunConfidence } from '@continuum/contracts';
import { HeroFigure } from '../components/HeroFigure';
import { conversionVolume } from '../reportModel';

export function ConversionVolumePanel({
  confidence,
  resultLabel = 'conversions',
  nameById,
}: {
  confidence: RunConfidence | null | undefined;
  resultLabel?: string;
  nameById?: ReadonlyMap<string, string>;
}) {
  const uiLocale = useLocale();

  const uiText = useTranslations('scale');
  const optimizerText = useMemo(() => createOptimizerDisplayTranslate(uiText), [uiText]);
  const volume = conversionVolume(confidence, optimizerText);
  if (!volume) {
    return (
      <p className="text-xs text-muted-foreground">
        {uiText('the_volume_read_appears_after_the_first_score_80c81f5')}
      </p>
    );
  }
  const name = (id: string) => nameById?.get(id)?.trim() || id;
  return (
    <div className="space-y-2 text-xs" data-testid="volume-panel">
      <p>
        <HeroFigure className="text-foreground" kind="headline">
          {volume.events}
        </HeroFigure>{' '}
        <span className="text-muted-foreground">
          {uiText.rich('sentence_a5e4750b70c9', { v0: resultLabel })}
        </span>
      </p>
      <p className="text-muted-foreground">
        {uiText.rich('sentence_3c9de267d61c', {
          v0: volume.floorEvents,
          v1: resultLabel,
        })}
      </p>
      {volume.underFloorIds.length > 0 ? (
        <div>
          <p className="font-medium text-foreground">
            {uiText.rich('sentence_eb7ea3c7f76b', {
              v0: volume.underFloorIds.length,
            })}
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {volume.underFloorIds.map((id) => (
              <li
                className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs"
                key={id}
                title={id}
              >
                {name(id)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-success">{uiText('every_ad_set_clears_the_floor_2ce8f53')}</p>
      )}
      {volume.actionables.length > 0 ? (
        <ul className="space-y-1 border-border/60 border-t pt-2">
          {volume.actionables.map((action) => (
            <li className="text-foreground" key={action.code}>
              {action.code === 'kpi_mismatch' ? null : (
                <span className="font-medium">{uiText('to_raise_it_898da5a')}</span>
              )}
              {action.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
