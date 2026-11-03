// A Home context for the Opportunities, Overnight and checklist render tests: the brand, its board
// in one mode, and nothing else the three tiles read (they read the Optimizer themselves).
import type { HomeBoardTile, HomeMode, HomeTileId, HomeTileSize } from '@continuum/contracts';
import type { HomeBoardContext } from '../../../types';

const VERB_LABELS: Record<HomeMode, string> = {
  operate: 'Create paused',
  approve: 'Send for approval',
  recommend: 'Add to checklist',
  fix: 'Open fix',
  setup: 'Start',
};

export function homeContext(brandId: string, mode: HomeMode = 'approve'): HomeBoardContext {
  return {
    brandId,
    brandName: 'Test brand',
    userId: 'user-1',
    adAccounts: [],
    organicAccounts: [],
    profileRows: [],
    reading: {
      mode,
      modeLabel: mode,
      modeReason: '',
      goal: { source: 'results', suggested: [], label: 'From your results', detail: '' },
      businessModel: null,
      modules: [],
      issues: [],
      opportunities: [],
    },
    board: {
      mode,
      verb: { label: VERB_LABELS[mode], done: '' },
      language: 'en',
      tiles: [],
    },
    setup: null,
    brandBookRefreshedAt: null,
  };
}

export function tileOf(id: HomeTileId, size: HomeTileSize = 'm'): HomeBoardTile {
  return { id, size, urgency: 2, score: 50, why: null };
}
