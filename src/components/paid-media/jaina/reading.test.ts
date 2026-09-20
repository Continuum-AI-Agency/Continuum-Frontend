import { describe, expect, it } from 'bun:test';
import { fallsAreGood, JUDGEMENT_LABEL, JUDGEMENT_TEXT, judgeDelta, judgeValue } from './reading';

describe('judgeDelta — the colour is a judgement, not a sign', () => {
  it('reads a rising value as good by default', () => {
    expect(judgeDelta({ change: 12 })).toBe('positive');
    expect(judgeDelta({ change: -12 })).toBe('risk');
  });

  it('inverts for a metric whose falling is the good outcome', () => {
    // This is the whole bug: a cost per result that FELL used to render red.
    expect(judgeDelta({ change: -12, goodWhenDown: true })).toBe('positive');
    expect(judgeDelta({ change: 12, goodWhenDown: true })).toBe('risk');
  });

  it('lets an explicit severity beat both — nothing re-derives a judgement someone made', () => {
    expect(judgeDelta({ change: 40, severity: 'risk' })).toBe('risk');
    expect(judgeDelta({ change: -40, goodWhenDown: false, severity: 'positive' })).toBe('positive');
    expect(judgeDelta({ change: 5, goodWhenDown: true, severity: 'watch' })).toBe('watch');
  });

  it('says "unjudged" rather than inventing "neutral" when there is nothing to judge', () => {
    // "there is no delta" and "the delta is unremarkable" are different facts.
    expect(judgeDelta({ change: null })).toBe('unjudged');
    expect(judgeDelta({ change: undefined })).toBe('unjudged');
    expect(judgeDelta({ change: 0 })).toBe('unjudged');
  });

  it('keeps severity authoritative even with no change at all', () => {
    expect(judgeDelta({ change: null, severity: 'risk' })).toBe('risk');
  });
});

describe('judgeValue', () => {
  it('passes an explicit severity through and calls an absent one unjudged', () => {
    expect(judgeValue('watch')).toBe('watch');
    expect(judgeValue(null)).toBe('unjudged');
    expect(judgeValue(undefined)).toBe('unjudged');
  });
});

describe('the palette says what it means', () => {
  it('separates "we looked and it is fine" from "nobody looked"', () => {
    // neutral is the ink; unjudged is muted. Collapsing them would claim a judgement
    // nobody made, which is the opposite of what this module exists for.
    expect(JUDGEMENT_TEXT.neutral).toBe('text-foreground');
    expect(JUDGEMENT_TEXT.unjudged).toBe('text-muted-foreground');
    expect(JUDGEMENT_TEXT.neutral).not.toBe(JUDGEMENT_TEXT.unjudged);
  });

  it('gives every judgement a word, because colour alone is not readable to everyone', () => {
    for (const key of Object.keys(JUDGEMENT_TEXT) as Array<keyof typeof JUDGEMENT_TEXT>) {
      expect(JUDGEMENT_LABEL[key].length).toBeGreaterThan(0);
    }
  });

  it('uses no emoji anywhere', () => {
    const all = [...Object.values(JUDGEMENT_TEXT), ...Object.values(JUDGEMENT_LABEL)].join(' ');
    expect(/\p{Extended_Pictographic}/u.test(all)).toBe(false);
  });
});

describe('fallsAreGood — narrow on purpose', () => {
  it('recognises the cost family', () => {
    for (const label of ['Cost per result', 'Cost/lead', 'CPA', 'CPL', 'CPM', 'CPC', 'CPI', 'Bounce rate']) {
      expect(fallsAreGood(label)).toBe(true);
    }
  });

  it('refuses to guess about anything else', () => {
    // A broad guess that paints a metric the wrong colour is worse than no colour at all.
    for (const label of ['Spend', 'Results', 'ROAS', 'CTR', 'Impressions', 'Conversations', 'Reach']) {
      expect(fallsAreGood(label)).toBe(false);
    }
  });

  it('is case and whitespace insensitive, because labels come from a model', () => {
    expect(fallsAreGood('  cost per purchase ')).toBe(true);
    expect(fallsAreGood('CPa')).toBe(true);
  });
});
