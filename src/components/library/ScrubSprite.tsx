'use client';

// Scrubbing a video card. The pointer's x across the card picks a moment, and that
// moment's tile of the scrub sprite paints over the card: one JPEG per clip, fetched on
// the first hover, instead of streaming video bytes into a grid. The playback lookup is
// cached per asset, so re-hovering a card (or its row in the list) asks nothing again.

import {
  type LibraryPlayback,
  type MediaAsset,
  SCRUB_SPRITE_GRID,
  scrubSpriteTile,
} from '@continuum/contracts';
import { type PointerEvent, useState } from 'react';
import { peekLibraryPlayback, useLibraryPlayback } from '@/lib/library/libraryPlayback';

type Sprite = NonNullable<LibraryPlayback['sprite']>;
type Box = { width: number; height: number };

// The sheet scaled so ONE tile covers the box (cropped to its centre, never stretched),
// then shifted so that tile sits under it. Pixels, not percentages: percentage positions
// in a 1000% background assume the tile and the box share an aspect ratio.
export function spriteCoverStyle(sprite: Sprite, fraction: number, box: Box) {
  const tile = scrubSpriteTile(fraction);
  const tileWidth = sprite.width / SCRUB_SPRITE_GRID;
  const tileHeight = sprite.height / SCRUB_SPRITE_GRID;
  const scale = Math.max(box.width / tileWidth, box.height / tileHeight);
  const x = (box.width - tileWidth * scale) / 2 - tile.column * tileWidth * scale;
  const y = (box.height - tileHeight * scale) / 2 - tile.row * tileHeight * scale;
  return {
    index: tile.index,
    style: {
      backgroundImage: `url("${sprite.signedUrl}")`,
      backgroundSize: `${sprite.width * scale}px ${sprite.height * scale}px`,
      backgroundPosition: `${x}px ${y}px`,
    },
  };
}

export function ScrubSprite({
  sprite,
  fraction,
  box,
}: {
  sprite: Sprite;
  fraction: number;
  box: Box;
}) {
  const { index, style } = spriteCoverStyle(sprite, fraction, box);
  return (
    <div
      data-testid="card-scrub"
      data-tile-index={index}
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-no-repeat"
      style={style}
    >
      <span
        className="absolute bottom-0 left-0 h-0.5 bg-white/80"
        style={{ width: `${fraction * 100}%` }}
      />
    </div>
  );
}

/**
 * Scrub state for one video card: `arm` on pointer-enter (starts the lookup), `track`
 * on move, `release` on leave, and render `overlay` inside the card's positioned box.
 * `sprite` is null until one is known — the card keeps its own hover behaviour till then.
 */
export function useCardScrub(asset: MediaAsset) {
  const isVideo = asset.kind === 'video';
  const [armed, setArmed] = useState(false);
  const [scrub, setScrub] = useState<{ fraction: number; box: Box } | null>(null);
  const loaded = useLibraryPlayback({
    brandId: asset.brandId,
    assetId: asset.id,
    enabled: armed && isVideo,
  });
  // A card that was hovered before (or another surface of the same asset) already knows.
  const playback = loaded ?? (isVideo ? peekLibraryPlayback({ assetId: asset.id }) : null);
  const sprite = playback?.sprite ?? null;

  const track = (event: PointerEvent<HTMLElement>) => {
    // A pointer already over the card when it scrolled (or a modal closed) under it moves
    // without ever entering: the move arms the lookup too.
    if (isVideo && !armed) setArmed(true);
    if (!sprite) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    setScrub({
      fraction: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      box: { width: rect.width, height: rect.height },
    });
  };

  return {
    sprite,
    arm: (event: PointerEvent<HTMLElement>) => {
      if (isVideo) setArmed(true);
      track(event);
    },
    track,
    release: () => setScrub(null),
    overlay:
      sprite && scrub ? (
        <ScrubSprite sprite={sprite} fraction={scrub.fraction} box={scrub.box} />
      ) : null,
  };
}
