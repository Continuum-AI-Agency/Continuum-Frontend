'use client';

// Which component draws each Home tile. Every tile is its own lazy chunk: the board mounts only
// the five to seven tiles the brand's board names, so a Home downloads (and reads) only those.
import type { HomeTileId } from '@continuum/contracts';
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import type { HomeTileProps } from './types';

type LazyTile = LazyExoticComponent<ComponentType<HomeTileProps>>;

export const HOME_TILES: Record<HomeTileId, LazyTile> = {
  goals: lazy(() => import('./modules/goals/Tile')),
  setup: lazy(() => import('./modules/setup/Tile')),
  health: lazy(() => import('./modules/health/Tile')),
  checklist: lazy(() => import('./modules/checklist/Tile')),
  brief: lazy(() => import('./modules/brief/Tile')),
  opps: lazy(() => import('./modules/opps/Tile')),
  pacing: lazy(() => import('./modules/pacing/Tile')),
  autopilot: lazy(() => import('./modules/autopilot/Tile')),
  creative: lazy(() => import('./modules/creative/Tile')),
  organic: lazy(() => import('./modules/organic/Tile')),
  market: lazy(() => import('./modules/market/Tile')),
};
