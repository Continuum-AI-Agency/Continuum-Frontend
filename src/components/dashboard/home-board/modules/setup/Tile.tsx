'use client';

// Placeholder until the setup tile lands: it says so, and never shows a figure.
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';

export default function SetupTile({ tile }: HomeTileProps) {
  return (
    <HomeTileFrame state="missing" tile={tile}>
      <TileMissing>This view is not available yet.</TileMissing>
    </HomeTileFrame>
  );
}
