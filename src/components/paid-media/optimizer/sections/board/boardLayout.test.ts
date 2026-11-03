import { describe, expect, it } from 'bun:test';
import {
  BOARD_LAYOUT_KEY,
  boardAskEntries,
  DEFAULT_BOARD_LAYOUT,
  readBoardLayout,
  writeBoardLayout,
} from './boardLayout';

function memoryStore(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

const refusing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('the layout a viewer chose', () => {
  it('opens on the board until the viewer picks Today', () => {
    expect(DEFAULT_BOARD_LAYOUT).toBe('adaptive');
    expect(readBoardLayout(memoryStore())).toBe('adaptive');
    expect(readBoardLayout(memoryStore({ [BOARD_LAYOUT_KEY]: 'today' }))).toBe('today');
    expect(readBoardLayout(memoryStore({ [BOARD_LAYOUT_KEY]: 'something-else' }))).toBe('adaptive');
  });

  it('stores the pick, and says when storage refused it', () => {
    const store = memoryStore();
    expect(writeBoardLayout('today', store)).toBe(true);
    expect(readBoardLayout(store)).toBe('today');
    expect(writeBoardLayout('today', refusing)).toBe(false);
    expect(writeBoardLayout('today', null)).toBe(false);
  });

  it('never throws on storage that refuses to be read', () => {
    expect(readBoardLayout(refusing)).toBe('adaptive');
    expect(readBoardLayout(null)).toBe('adaptive');
  });
});

describe('the board’s questions for Jaina', () => {
  const tab = [{ key: 'search_terms', label: 'Which search terms bring leads?', prompt: 'For…' }];

  // Easy Fit Meta's questions on the adaptive page (data.js), in the account's language.
  it('asks the reading’s questions as written, each its own prompt', () => {
    expect(boardAskEntries(['¿Qué sucursal me da los tours más baratos?', '  '], tab)).toEqual([
      {
        key: 'reading-0',
        label: '¿Qué sucursal me da los tours más baratos?',
        prompt: '¿Qué sucursal me da los tours más baratos?',
      },
    ]);
  });

  it('keeps the tab’s questions when the reading has none', () => {
    expect(boardAskEntries([], tab)).toEqual(tab);
  });
});
