'use client';

// The conversion-volume panel: the count, the floor, the ad sets under it by name, and what
// the engine says would raise the count it can score on. Replaces the confidence radar.

import type { RunConfidence } from '@continuum/contracts';
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
  const volume = conversionVolume(confidence);
  if (!volume) {
    return (
      <p className="text-2xs text-muted-foreground">
        The volume read appears after the first scored cycle.
      </p>
    );
  }
  const name = (id: string) => nameById?.get(id)?.trim() || id;
  return (
    <div className="space-y-2 text-xs" data-testid="volume-panel">
      <p>
        <span className="font-semibold text-2xl text-foreground tabular-nums">{volume.events}</span>{' '}
        <span className="text-muted-foreground">{resultLabel} in the last 14 days</span>
      </p>
      <p className="text-muted-foreground">
        The engine reads an ad set as measured once it clears {volume.floorEvents} {resultLabel} in
        14 days; below that its score is a guess and its budget is held closer.
      </p>
      {volume.underFloorIds.length > 0 ? (
        <div>
          <p className="font-medium text-foreground">
            Under the floor ({volume.underFloorIds.length})
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {volume.underFloorIds.map((id) => (
              <li
                className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-2xs"
                key={id}
                title={id}
              >
                {name(id)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-emerald-600 dark:text-emerald-400">Every ad set clears the floor.</p>
      )}
      {volume.actionables.length > 0 ? (
        <ul className="space-y-1 border-border/60 border-t pt-2">
          {volume.actionables.map((action) => (
            <li className="text-foreground" key={action.code}>
              <span className="font-medium">To raise it:</span> {action.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
