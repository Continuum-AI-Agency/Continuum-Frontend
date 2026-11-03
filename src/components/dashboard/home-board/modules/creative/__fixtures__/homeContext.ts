// A Home board context for the creative tile's render tests: one Meta account in MXN, in the
// mode the test names. Only what the tile reads is meaningful; the rest is the smallest valid
// value of its type.
import type { HomeBoardTile, HomeMode } from '@continuum/contracts';
import type { HomeBoardContext } from '../../../types';
import { EASY_FIT_ACCOUNT } from './creativeReport';

const VERBS: Record<HomeMode, string> = {
  operate: 'Create paused',
  approve: 'Send for approval',
  recommend: 'Add to checklist',
  fix: 'Open fix',
  setup: 'Start',
};

export function creativeTile(size: HomeBoardTile['size'] = 'm'): HomeBoardTile {
  return { id: 'creative', size, urgency: 2, score: 48, why: null };
}

export function homeContext(
  overrides: Partial<HomeBoardContext> & { mode?: HomeMode } = {},
): HomeBoardContext {
  const { mode = 'operate', ...rest } = overrides;
  return {
    brandId: '148583e0-5538-462b-8d3a-acd25b80344e',
    brandName: 'Easy Fit',
    userId: 'user-1',
    adAccounts: [EASY_FIT_ACCOUNT],
    organicAccounts: [],
    profileRows: [],
    reading: {
      mode,
      modeLabel: mode,
      modeReason: '',
      goal: { source: 'none', suggested: [], label: '', detail: '' },
      businessModel: null,
      modules: [],
      issues: [],
      opportunities: [],
    },
    board: {
      mode,
      verb: { label: VERBS[mode], done: '' },
      language: 'es',
      tiles: [creativeTile()],
    },
    setup: null,
    brandBookRefreshedAt: null,
    ...rest,
  };
}
