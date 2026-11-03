import { describe, expect, it } from 'bun:test';
import { readingFor } from '../ask/__fixtures__/readings';
import {
  BRIEF_TODAY,
  GOOGLE_ACCOUNT,
  GOOGLE_NARRATIVE,
  GOOGLE_READ_STALE,
} from '../brief/__fixtures__/accountReads';
import { briefEntries } from '../brief/briefModel';
import { weeklyStory } from './storyModel';

const keys = (slides: ReturnType<typeof weeklyStory>) => slides.map((slide) => slide.key);

describe('weeklyStory', () => {
  it('approve: the mode, the goal, the biggest opportunity, then what else waits', () => {
    const { reading } = readingFor('approve');
    const slides = weeklyStory({ reading, brief: null, today: BRIEF_TODAY });
    expect(keys(slides)).toEqual(['mode', 'goal', 'opportunity', 'waiting']);
    expect(slides[0]).toMatchObject({ title: 'You approve' });
    expect(slides[2]).toMatchObject({
      kicker: 'Biggest opportunity',
      title: '3 recommendations and 1 budget move waiting in MENSAJES',
    });
    expect(slides[3]?.list).toEqual(['1 recommendation waiting in FORMULARIOS']);
  });

  it('fix: the problems come before anything else and no opportunity is invented', () => {
    const { reading } = readingFor('fix');
    const slides = weeklyStory({ reading, brief: null, today: BRIEF_TODAY });
    expect(keys(slides)).toEqual(['mode', 'issues', 'goal']);
    expect(slides[1]?.list).toEqual([
      'Leads // Google Ads only lost the campaigns it manages',
      'Conversaciones Whatsapp has read no new data for 4 days',
    ]);
  });

  it("setup: the goal read from the Brand Book, and nothing about results it can't have", () => {
    const { reading } = readingFor('setup');
    const slides = weeklyStory({ reading, brief: null, today: BRIEF_TODAY });
    expect(keys(slides)).toEqual(['mode', 'goal']);
    expect(slides[1]).toMatchObject({ title: 'Revenue' });
  });

  it("adds Jaina's latest read, dated, with its words as stored", () => {
    const { reading } = readingFor('operate');
    const [brief] = briefEntries(
      [{ account: GOOGLE_ACCOUNT, status: 'success', data: GOOGLE_READ_STALE }],
      BRIEF_TODAY,
    );
    const slides = weeklyStory({ reading, brief: brief ?? null, today: BRIEF_TODAY });
    const read = slides.find((slide) => slide.key === 'brief');
    expect(read).toMatchObject({
      kicker: "Jaina's latest read",
      title: 'Read on Oct 30 · 4 days old',
      body: GOOGLE_NARRATIVE,
    });
  });

  it('suggests grouping campaigns when that is the only opportunity', () => {
    const { reading } = readingFor('approve');
    const slides = weeklyStory({
      reading: {
        ...reading,
        opportunities: [
          {
            portfolioId: null,
            title: 'Group your campaigns in a portfolio so Continuum can move budget toward leads',
            count: 0,
          },
        ],
      },
      brief: null,
      today: BRIEF_TODAY,
    });
    expect(slides.find((slide) => slide.key === 'opportunity')).toMatchObject({
      kicker: 'Next step',
      title: 'Group your campaigns in a portfolio so Continuum can move budget toward leads',
    });
    expect(keys(slides)).not.toContain('waiting');
  });
});
