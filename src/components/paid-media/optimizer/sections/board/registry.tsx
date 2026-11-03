'use client';

// Which component draws each board module. Every module is its own lazy chunk: the board mounts
// only the ones the reading puts on it, so an account that shows four modules downloads four.
import type { BoardModuleId } from '@continuum/contracts';
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import type { BoardModuleProps } from './types';

type LazyModule = LazyExoticComponent<ComponentType<BoardModuleProps>>;

export const BOARD_MODULES: Record<BoardModuleId, LazyModule> = {
  result: lazy(() => import('./modules/ResultHero')),
  decisions: lazy(() => import('./modules/DecisionsStack')),
  portfolios: lazy(() => import('./modules/PortfolioLanes')),
  mix: lazy(() => import('./lenses/google/MixLens')),
  auction: lazy(() => import('./lenses/google/AuctionLens')),
  signal: lazy(() => import('./lenses/google/SignalLens')),
  terms: lazy(() => import('./lenses/google/TermsLens')),
  quality: lazy(() => import('./lenses/google/QualityLens')),
  pmax: lazy(() => import('./lenses/google/PmaxLens')),
  branches: lazy(() => import('./lenses/meta/BranchesLens')),
  headroom: lazy(() => import('./lenses/meta/HeadroomLens')),
  events: lazy(() => import('./lenses/meta/EventsLens')),
  structure: lazy(() => import('./lenses/meta/StructureMap')),
};

/** Each module's title, product chrome in English: what the board names a slot it draws itself
 *  (a frame that could not be drawn), and what a module's own frame should say. */
export const BOARD_MODULE_TITLES: Record<BoardModuleId, string> = {
  result: 'Result',
  decisions: 'Decisions',
  portfolios: 'Portfolios',
  mix: 'Campaign mix',
  auction: 'Auction share',
  signal: 'Conversion signal',
  terms: 'Search terms',
  quality: 'Quality Score',
  pmax: 'Performance Max',
  branches: 'Branches',
  headroom: 'Delivery headroom',
  events: 'Optimization event',
  structure: 'Structure',
};
