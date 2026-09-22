import { describe, expect, it } from 'bun:test';
import {
  explicitSeverity,
  fallsAreGood,
  JAINA_ANSWER_PROSE,
  JUDGEMENT_LABEL,
  JUDGEMENT_RULE,
  JUDGEMENT_TEXT,
  judgeDelta,
  judgeValue,
} from './reading';

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
    for (const label of [
      'Cost per result',
      'Cost/lead',
      'CPA',
      'CPL',
      'CPM',
      'CPC',
      'CPI',
      'Bounce rate',
    ]) {
      expect(fallsAreGood(label)).toBe(true);
    }
  });

  it('refuses to guess about anything else', () => {
    // A broad guess that paints a metric the wrong colour is worse than no colour at all.
    for (const label of [
      'Spend',
      'Results',
      'ROAS',
      'CTR',
      'Impressions',
      'Conversations',
      'Reach',
    ]) {
      expect(fallsAreGood(label)).toBe(false);
    }
  });

  it('is case and whitespace insensitive, because labels come from a model', () => {
    expect(fallsAreGood('  cost per purchase ')).toBe(true);
    expect(fallsAreGood('CPa')).toBe(true);
  });
});

describe('explicitSeverity — a default is not a judgement', () => {
  it("treats the schema's `neutral` default as silence", () => {
    // `metricItemSchema` and `comparisonPairSchema` both `.default('neutral')`, so every
    // item arrives judged-looking. Measured against the last six production reports: all
    // of them, every metric, `severity: "neutral"` — not one an actual judgement.
    expect(explicitSeverity('neutral')).toBeNull();
    expect(explicitSeverity(null)).toBeNull();
    expect(explicitSeverity(undefined)).toBeNull();
  });

  it('passes a real judgement straight through', () => {
    expect(explicitSeverity('risk')).toBe('risk');
    expect(explicitSeverity('positive')).toBe('positive');
    expect(explicitSeverity('watch')).toBe('watch');
  });

  it('is what lets the polarity rule run at all on a defaulted delta', () => {
    // Without it, the truthy `'neutral'` wins in judgeDelta and a cost that fell reads as
    // unremarkable ink — the polarity rule never executes.
    expect(judgeDelta({ change: -18, goodWhenDown: true, severity: 'neutral' })).toBe('neutral');
    expect(
      judgeDelta({ change: -18, goodWhenDown: true, severity: explicitSeverity('neutral') }),
    ).toBe('positive');
  });
});

describe('JUDGEMENT_RULE — the same law, as a left rule', () => {
  it('uses design tokens, never raw palette literals', () => {
    // The maps this replaced were `border-emerald-500 / border-amber-500 / border-red-500`,
    // which do not follow the dark theme's redefinition of --success and --warning.
    for (const value of Object.values(JUDGEMENT_RULE)) {
      expect(value).toMatch(/^border-l-(success|destructive|warning|border)$/);
    }
  });

  it('leaves an unjudged item uncoloured, exactly like the ink', () => {
    expect(JUDGEMENT_RULE.unjudged).toBe('border-l-border');
    expect(JUDGEMENT_RULE.neutral).toBe('border-l-border');
  });
});

describe("JAINA_ANSWER_PROSE — the answer is not 'nobody judged this'", () => {
  it('sets the answer in reading ink at reading size', () => {
    expect(JAINA_ANSWER_PROSE).toContain('text-foreground');
    expect(JAINA_ANSWER_PROSE).toContain('text-base');
    // The regression it exists to prevent: the report path set the executive summary in
    // muted ink, which by this module's own law means nobody judged it.
    expect(JAINA_ANSWER_PROSE).not.toContain('text-muted-foreground');
  });

  it('lines up the digits in a markdown table, which Streamdown does not', () => {
    expect(JAINA_ANSWER_PROSE).toContain('tabular-nums');
  });
});
