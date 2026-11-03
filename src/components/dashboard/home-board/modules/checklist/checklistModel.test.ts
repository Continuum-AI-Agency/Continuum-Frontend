import { describe, expect, it } from 'bun:test';
import {
  EASY_FIT_PORTFOLIOS,
  PINK_ELEPHANT_PORTFOLIOS,
  portfolioWith,
} from '../opps/__fixtures__/portfolios';
import {
  EASY_FIT_SIZED_AND_UNSIZED,
  PINK_ELEPHANT_RECOMMENDATIONS,
} from './__fixtures__/recommendations';
import {
  CHECKLIST_MISSING,
  checklistCsv,
  checklistFileName,
  checklistItemsOf,
  checklistViewOf,
} from './checklistModel';

const [PINK] = PINK_ELEPHANT_PORTFOLIOS;
if (!PINK) throw new Error('fixture lost Pink Elephant');
const EASY_FIT_AUTOPILOT = EASY_FIT_PORTFOLIOS[1];
if (!EASY_FIT_AUTOPILOT) throw new Error('fixture lost Easy Fit');

describe('checklistViewOf', () => {
  it('counts the pending recommendations of the portfolios the client applies', () => {
    const view = checklistViewOf(PINK_ELEPHANT_PORTFOLIOS);
    expect(view).toMatchObject({ state: 'ready', open: 9 });
    if (view.state !== 'ready') return;
    expect(view.portfolios.map((portfolio) => portfolio.name)).toEqual([
      'Evento Webinar 29 Octubre',
    ]);
  });

  it('leaves out portfolios Continuum writes itself, observing ones and inactive ones', () => {
    const rows = [
      ...EASY_FIT_PORTFOLIOS,
      portfolioWith(PINK, { id: crypto.randomUUID(), apply_mode: 'observe' }),
      portfolioWith(PINK, { id: crypto.randomUUID(), status: 'paused' }),
      PINK,
    ];
    const view = checklistViewOf(rows);
    expect(view).toMatchObject({ state: 'ready', open: 9 });
  });

  it('is ready at zero when the client portfolio has nothing pending', () => {
    expect(checklistViewOf([portfolioWith(PINK, { pending_recommendations: 0 })])).toMatchObject({
      state: 'ready',
      open: 0,
    });
  });

  it('is missing when no portfolio recommends changes for the client', () => {
    expect(checklistViewOf(EASY_FIT_PORTFOLIOS)).toEqual({ state: 'missing' });
    expect(checklistViewOf([])).toEqual({ state: 'missing' });
    expect(CHECKLIST_MISSING).toContain('Optimizer');
  });
});

describe('checklistItemsOf', () => {
  it('turns each pending recommendation into an item with its stored words', () => {
    const items = checklistItemsOf(PINK_ELEPHANT_RECOMMENDATIONS, PINK, null);
    expect(items).toHaveLength(9);
    const checklist = items.find((item) => item.id === 'ec958978-0128-4b67-98a0-524da567d762');
    expect(checklist).toMatchObject({
      portfolioName: 'Evento Webinar 29 Octubre',
      detail:
        "Of the 3 actions agreed with the client, 2 show in Google's change history and 1 does not yet. The client runs this account: this is a recommendation to hand over, nothing here changes it.",
      impact: null,
    });
    expect(checklist?.title.length).toBeGreaterThan(0);
    for (const item of items) expect(item.title.trim()).not.toBe('');
  });

  it('shows impact only where the row carries it, in money per day', () => {
    const items = checklistItemsOf(EASY_FIT_SIZED_AND_UNSIZED, EASY_FIT_AUTOPILOT, null);
    expect(items.map((item) => item.impact)).toEqual(['$2,260 MXN/day', null]);
  });

  it('leaves out a recommendation already decided', () => {
    const [first, ...rest] = PINK_ELEPHANT_RECOMMENDATIONS;
    if (!first) throw new Error('fixture empty');
    const items = checklistItemsOf([{ ...first, status: 'approved' }, ...rest], PINK, null);
    expect(items).toHaveLength(8);
  });
});

describe('the exported checklist', () => {
  it('is a CSV with one row per item: portfolio, item, why and impact as stored', () => {
    const items = checklistItemsOf(EASY_FIT_SIZED_AND_UNSIZED, EASY_FIT_AUTOPILOT, null);
    const lines = checklistCsv(items).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Portfolio,Item,Why,Impact per day,Raised');
    expect(lines).toHaveLength(3);
    expect(lines[1]?.startsWith('Conversaciones Whatsapp,')).toBe(true);
    expect(lines[1]).toContain(
      '"Efficiency mode left $2,260 MXN of the $3,159 MXN pool unallocated (72%)',
    );
    expect(lines[1]).toContain(',"$2,260 MXN/day",2026-11-03');
    expect(lines[2]?.endsWith(',,2026-11-03')).toBe(true);
  });

  it('quotes commas, quotes and line breaks so the file opens as written', () => {
    const csv = checklistCsv([
      {
        id: '1',
        portfolioName: 'A, "B"',
        title: 'Line\nbreak',
        detail: null,
        impact: null,
        raisedOn: null,
      },
    ]);
    expect(csv.split('\r\n')[1]).toBe('"A, ""B""","Line\nbreak",,,');
  });

  it('names the file after the brand and the day', () => {
    expect(checklistFileName('Pink Elephant', new Date('2026-11-03T20:00:00Z'))).toBe(
      'pink-elephant-client-checklist-2026-11-03.csv',
    );
    expect(checklistFileName(null, new Date('2026-11-03T20:00:00Z'))).toBe(
      'client-checklist-2026-11-03.csv',
    );
  });
});
