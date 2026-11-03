// The Home's adaptive board (H01): which tiles a brand's Home shows, at what size, in what order,
// and the one sentence that put each tile there. It reads the same signals readBrand reads, plus
// the reading itself, so the board can never disagree with the mode, the goal or the issues the
// reading names.
//
// A tile is promised only when its source exists for the brand: no ad account means no pacing,
// no creative and no opportunities; no organic profile means no organic week. Which figure a tile
// then draws is the tile's own read; the board only says why the tile is here, and a `why` is
// written only when the signals hold the figure it cites. Otherwise it is null, never a guess.
//
// Score = impact on the goal × urgency × confidence. The mode's lead tile always opens the board;
// the rest follow by score, capped at seven so the Home mounts at most seven reads.
//
// Pure: every tile and every sentence can be checked against its inputs (home:reading:bench).

import { z } from 'zod';
import {
  type HomeBrandReading,
  type HomeBrandSignals,
  type HomeMode,
  readBrand,
} from './brandReading';
import { type HomeBoardLanguage, homeBoardWhy } from './homeBoardCopy';

export const homeTileIdSchema = z.enum([
  'goals',
  'setup',
  'health',
  'checklist',
  'brief',
  'opps',
  'pacing',
  'autopilot',
  'creative',
  'organic',
  'market',
]);
export type HomeTileId = z.infer<typeof homeTileIdSchema>;

export const homeTileSizeSchema = z.enum(['l', 'm', 's']);
export type HomeTileSize = z.infer<typeof homeTileSizeSchema>;

/** 3 = act today, 2 = this week, 1 = worth a look. */
export type HomeTileUrgency = 1 | 2 | 3;

export type HomeBoardTile = {
  id: HomeTileId;
  size: HomeTileSize;
  urgency: HomeTileUrgency;
  /** Impact × urgency × confidence, 0 to 100. */
  score: number;
  /** One sentence in the account's language citing a figure from the signals; null when the
   *  signals hold no figure for this tile (the tile then speaks from its own read). */
  why: string | null;
};

export type HomeBoardVerb = {
  /** The label of every tile's main button in this mode (product chrome, English). */
  label: string;
  /** What happened, said in a toast after the button is used. */
  done: string;
};

export type HomeBoard = {
  mode: HomeMode;
  verb: HomeBoardVerb;
  language: HomeBoardLanguage;
  tiles: HomeBoardTile[];
};

export const HOME_BOARD_MAX_TILES = 7;

export const HOME_TILE_LABELS: Record<HomeTileId, string> = {
  goals: 'Goal',
  setup: 'Setup',
  health: 'Account health',
  checklist: 'Client checklist',
  brief: 'Jaina brief',
  opps: 'Opportunities',
  pacing: 'Pacing',
  autopilot: 'Overnight',
  creative: 'Creative',
  organic: 'Organic week',
  market: 'Market',
};

/** The order the board uses when sorted by module. */
export const HOME_TILE_MODULE_ORDER: readonly HomeTileId[] = homeTileIdSchema.options;

const VERBS: Record<HomeMode, HomeBoardVerb> = {
  operate: { label: 'Create paused', done: 'Created paused: review it before it spends.' },
  approve: { label: 'Send for approval', done: 'Sent for approval: it waits for your team.' },
  recommend: { label: 'Add to checklist', done: 'Added to the client checklist.' },
  fix: { label: 'Open fix', done: 'Fix opened.' },
  setup: { label: 'Start', done: 'Step started.' },
};

const LEAD_BY_MODE: Record<HomeMode, HomeTileId> = {
  operate: 'goals',
  approve: 'opps',
  recommend: 'checklist',
  fix: 'health',
  setup: 'setup',
};

type Candidate = { id: HomeTileId; impact: number; urgency: HomeTileUrgency; confidence: number };

function candidatesOf(signals: HomeBrandSignals, reading: HomeBrandReading): Candidate[] {
  const { ads, organic } = signals.accounts;
  const active = signals.portfolios.filter((portfolio) => portfolio.status === 'active');
  // Only a portfolio Continuum may write runs overnight; where the client applies the changes
  // (every platform's writes off) there is no overnight log to show.
  const acting = active.filter(
    (portfolio) => portfolio.applyMode !== 'observe' && portfolio.canWrite !== false,
  );
  const waiting = reading.opportunities.reduce((sum, opportunity) => sum + opportunity.count, 0);
  const issues = reading.issues.length;
  const out: Candidate[] = [];

  if (ads + organic === 0) {
    out.push({ id: 'setup', impact: 10, urgency: 3, confidence: 1 });
    out.push({ id: 'goals', impact: 6, urgency: 1, confidence: 0.6 });
    out.push({ id: 'market', impact: 3, urgency: 1, confidence: 0.5 });
    return out;
  }

  out.push({
    id: 'goals',
    impact: 10,
    urgency: reading.goal.source === 'team' ? 2 : 1,
    confidence: ads > 0 ? 1 : 0.6,
  });
  if (ads > 0) {
    out.push({ id: 'health', impact: 9, urgency: issues > 0 ? 3 : 1, confidence: 1 });
    out.push({
      id: 'opps',
      impact: 8,
      urgency: waiting > 0 ? 3 : 1,
      confidence: active.length > 0 ? 0.9 : 0.5,
    });
    out.push({ id: 'pacing', impact: 7, urgency: 2, confidence: active.length > 0 ? 0.8 : 0.4 });
    out.push({ id: 'creative', impact: 6, urgency: 2, confidence: 0.8 });
    out.push({ id: 'brief', impact: 5, urgency: 1, confidence: 0.7 });
    if (acting.length > 0) {
      out.push({ id: 'autopilot', impact: 6, urgency: 2, confidence: 0.9 });
    }
    if (reading.mode === 'recommend') {
      out.push({ id: 'checklist', impact: 8, urgency: waiting > 0 ? 3 : 2, confidence: 0.9 });
    }
  }
  if (organic > 0) {
    out.push({ id: 'organic', impact: ads === 0 ? 9 : 5, urgency: 1, confidence: 0.8 });
  }
  out.push({ id: 'market', impact: 3, urgency: 1, confidence: 0.5 });
  return out;
}

function sizeAt(rank: number): HomeTileSize {
  if (rank === 0) return 'l';
  return rank <= 2 ? 'm' : 's';
}

/** The board a brand's Home shows, from its signals (and its reading, when the caller has it). */
export function readHomeBoard(
  signals: HomeBrandSignals,
  options: { reading?: HomeBrandReading; language?: HomeBoardLanguage } = {},
): HomeBoard {
  const reading = options.reading ?? readBrand(signals);
  const language = options.language ?? 'es';
  const lead = LEAD_BY_MODE[reading.mode];
  const scored = candidatesOf(signals, reading).map((candidate) => ({
    ...candidate,
    score: Math.round(candidate.impact * candidate.urgency * candidate.confidence * (10 / 3)),
  }));
  const ordered = scored.sort((a, b) => {
    if (a.id === lead) return -1;
    if (b.id === lead) return 1;
    return (
      b.score - a.score ||
      HOME_TILE_MODULE_ORDER.indexOf(a.id) - HOME_TILE_MODULE_ORDER.indexOf(b.id)
    );
  });
  const tiles = ordered.slice(0, HOME_BOARD_MAX_TILES).map((candidate, rank) => ({
    id: candidate.id,
    size: sizeAt(rank),
    urgency: candidate.urgency,
    score: Math.min(100, candidate.score),
    why: homeBoardWhy(candidate.id, signals, reading, language),
  }));
  return { mode: reading.mode, verb: VERBS[reading.mode], language, tiles };
}

export type HomeBoardSort = 'impact' | 'urgency' | 'module';

/** The board's tiles in the order the person picked; pinned tiles stay first, in board order. */
export function arrangeHomeTiles(
  tiles: HomeBoardTile[],
  sort: HomeBoardSort,
  pinned: ReadonlySet<HomeTileId>,
): HomeBoardTile[] {
  const indexed = tiles.map((tile, index) => ({ tile, index }));
  if (sort === 'urgency') {
    indexed.sort((a, b) => b.tile.urgency - a.tile.urgency || a.index - b.index);
  } else if (sort === 'module') {
    indexed.sort(
      (a, b) =>
        HOME_TILE_MODULE_ORDER.indexOf(a.tile.id) - HOME_TILE_MODULE_ORDER.indexOf(b.tile.id),
    );
  }
  const pinnedFirst = [
    ...indexed.filter(({ tile }) => pinned.has(tile.id)),
    ...indexed.filter(({ tile }) => !pinned.has(tile.id)),
  ];
  return pinnedFirst.map(({ tile }) => tile);
}
