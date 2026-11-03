import { describe, expect, it } from 'bun:test';
import type { HomeBrandSignals, HomePortfolioSignal } from './brandReading';
import {
  arrangeHomeTiles,
  HOME_BOARD_MAX_TILES,
  type HomeBoardTile,
  type HomeTileId,
  readHomeBoard,
} from './homeBoard';

const brand = (overrides: Partial<HomeBrandSignals> = {}): HomeBrandSignals => ({
  accounts: { ads: 1, organic: 1 },
  savedGoal: null,
  business: null,
  portfolios: [],
  approvalRequired: false,
  ...overrides,
});

const portfolio = (overrides: Partial<HomePortfolioSignal> = {}): HomePortfolioSignal => ({
  id: 'p1',
  name: 'Leads',
  applyMode: 'recommend',
  status: 'active',
  autopilotPaused: false,
  pendingRecommendations: 0,
  pendingBudgetMoves: 0,
  staleForDays: null,
  rosterAbsent: false,
  ...overrides,
});

const ids = (tiles: HomeBoardTile[]) => tiles.map((tile) => tile.id);

describe('readHomeBoard — the mode opens the board', () => {
  it('opens a brand with nothing connected on its setup, and shows setup only then', () => {
    const board = readHomeBoard(brand({ accounts: { ads: 0, organic: 0 } }));
    expect(board.mode).toBe('setup');
    expect(board.tiles[0]).toMatchObject({ id: 'setup', size: 'l' });
    expect(board.verb.label).toBe('Start');
    expect(ids(readHomeBoard(brand()).tiles)).not.toContain('setup');
  });

  it('opens an autopilot brand on its goal and says buttons create paused', () => {
    const board = readHomeBoard(brand({ portfolios: [portfolio({ applyMode: 'autopilot' })] }));
    expect(board.mode).toBe('operate');
    expect(board.tiles[0]?.id).toBe('goals');
    expect(board.verb.label).toBe('Create paused');
  });

  it('opens a brand with a blocked portfolio on its health', () => {
    const board = readHomeBoard(brand({ portfolios: [portfolio({ rosterAbsent: true })] }));
    expect(board.mode).toBe('fix');
    expect(board.tiles[0]?.id).toBe('health');
    expect(board.tiles[0]?.why).toMatch(/\d/);
  });

  it('opens an approve brand on its opportunities', () => {
    const board = readHomeBoard(
      brand({ portfolios: [portfolio({ applyMode: 'recommend', pendingRecommendations: 3 })] }),
    );
    expect(board.mode).toBe('approve');
    expect(board.tiles[0]).toMatchObject({ id: 'opps', why: '3 esperan tu decisión' });
    expect(board.verb.label).toBe('Send for approval');
  });

  it('opens a brand whose client applies the changes on the client checklist (Pink)', () => {
    const board = readHomeBoard(
      brand({
        portfolios: [portfolio({ canWrite: false, pendingRecommendations: 2 })],
      }),
    );
    expect(board.mode).toBe('recommend');
    expect(board.tiles[0]).toMatchObject({ id: 'checklist', why: '2 cambios para el cliente' });
    expect(ids(board.tiles)).not.toContain('autopilot');
  });
});

describe('readHomeBoard — a recommend brand with no client checklist', () => {
  it('opens on its top score, not on an empty checklist, when Continuum reads and recommends', () => {
    const board = readHomeBoard(brand());
    expect(board.mode).toBe('recommend');
    expect(ids(board.tiles)).not.toContain('checklist');
    expect(board.tiles[0]).toMatchObject({ id: 'goals', size: 'l' });
  });

  it('opens an organic-only brand on its organic week', () => {
    const board = readHomeBoard(brand({ accounts: { ads: 0, organic: 1 } }));
    expect(board.mode).toBe('recommend');
    expect(board.tiles[0]).toMatchObject({ id: 'organic', size: 'l' });
  });

  it('counts only what the client applies in the checklist sentence', () => {
    const board = readHomeBoard(
      brand({
        portfolios: [
          portfolio({ id: 'client', canWrite: false, pendingRecommendations: 2, pendingBudgetMoves: 4 }),
          portfolio({ id: 'observed', applyMode: 'observe', canWrite: false, pendingRecommendations: 8 }),
        ],
      }),
    );
    expect(board.tiles[0]).toMatchObject({ id: 'checklist', why: '2 cambios para el cliente' });
  });
});

describe('readHomeBoard — a tile only where its source exists', () => {
  it('promises no paid tile without an ad account', () => {
    const tiles = ids(readHomeBoard(brand({ accounts: { ads: 0, organic: 2 } })).tiles);
    for (const paid of ['pacing', 'creative', 'opps', 'health', 'brief', 'autopilot'] as const) {
      expect(tiles).not.toContain(paid);
    }
    expect(tiles).toContain('organic');
  });

  it('promises no pacing and no brief without an active portfolio', () => {
    const tiles = ids(readHomeBoard(brand()).tiles);
    expect(tiles).not.toContain('pacing');
    expect(tiles).not.toContain('brief');
    const withPortfolio = ids(
      readHomeBoard(brand({ accounts: { ads: 1, organic: 0 }, portfolios: [portfolio()] })).tiles,
    );
    expect(withPortfolio).toContain('pacing');
    expect(withPortfolio).toContain('brief');
  });

  it('promises no organic week without an organic profile', () => {
    expect(ids(readHomeBoard(brand({ accounts: { ads: 1, organic: 0 } })).tiles)).not.toContain(
      'organic',
    );
  });

  it('caps the board at seven tiles, sized l, m, m, then s', () => {
    const board = readHomeBoard(
      brand({ portfolios: [portfolio({ applyMode: 'autopilot', pendingBudgetMoves: 1 })] }),
    );
    expect(board.tiles.length).toBeLessThanOrEqual(HOME_BOARD_MAX_TILES);
    expect(board.tiles.length).toBeGreaterThanOrEqual(5);
    expect(board.tiles.map((tile) => tile.size)).toEqual(
      board.tiles.map((_, rank) => (rank === 0 ? 'l' : rank <= 2 ? 'm' : 's')),
    );
    expect(new Set(ids(board.tiles)).size).toBe(board.tiles.length);
  });
});

describe('readHomeBoard — every why cites a figure the signals hold', () => {
  it('writes a sentence only with a digit in it, or none at all', () => {
    const boards = [
      readHomeBoard(brand({ accounts: { ads: 0, organic: 0 } })),
      readHomeBoard(brand({ portfolios: [portfolio({ applyMode: 'autopilot' })] })),
      readHomeBoard(brand({ portfolios: [portfolio({ staleForDays: 9 })] })),
      readHomeBoard(brand()),
    ];
    for (const tile of boards.flatMap((board) => board.tiles)) {
      if (tile.why !== null) expect(tile.why).toMatch(/\d/);
    }
  });

  it('writes in English when the account is English', () => {
    const board = readHomeBoard(brand({ portfolios: [portfolio({ pendingRecommendations: 1 })] }), {
      language: 'en',
    });
    expect(board.tiles.find((tile) => tile.id === 'opps')?.why).toBe('1 waiting for a decision');
  });
});

describe('arrangeHomeTiles — sort and pins', () => {
  const tiles: HomeBoardTile[] = [
    { id: 'goals', size: 'l', urgency: 1, score: 30, why: null },
    { id: 'opps', size: 'm', urgency: 3, score: 72, why: '3 esperan tu decisión' },
    { id: 'market', size: 's', urgency: 1, score: 5, why: null },
    { id: 'health', size: 's', urgency: 2, score: 40, why: null },
  ];
  const order = (sorted: HomeBoardTile[]): HomeTileId[] => ids(sorted);

  it('keeps the board order by goal impact', () => {
    expect(order(arrangeHomeTiles(tiles, 'impact', new Set()))).toEqual([
      'goals',
      'opps',
      'market',
      'health',
    ]);
  });

  it('sorts by urgency, ties in board order', () => {
    expect(order(arrangeHomeTiles(tiles, 'urgency', new Set()))).toEqual([
      'opps',
      'health',
      'goals',
      'market',
    ]);
  });

  it('sorts by module order', () => {
    expect(order(arrangeHomeTiles(tiles, 'module', new Set()))).toEqual([
      'goals',
      'health',
      'opps',
      'market',
    ]);
  });

  it('keeps a pinned tile first whatever the sort', () => {
    expect(order(arrangeHomeTiles(tiles, 'urgency', new Set<HomeTileId>(['market'])))[0]).toBe(
      'market',
    );
  });
});
