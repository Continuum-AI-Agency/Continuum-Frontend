import { describe, expect, it } from 'bun:test';
import { stripPaceClaim } from './paceClaim';

describe('stripPaceClaim', () => {
  it('removes the clause the live brief joined to a measured reading with an "and"', () => {
    // Easy Fit, FORMULARIOS // TODOS, 2026-09-22 — verbatim. No flight is declared on the
    // portfolio, so "on track" was the fallback row wearing a verdict's word.
    const live =
      'Over the last 14 days, the portfolio spent 3594.41 to acquire 78 leads at a cost of 46.08 per lead, which is above the 35 target, and is on track.';
    expect(stripPaceClaim(live)).toBe(
      'Over the last 14 days, the portfolio spent 3594.41 to acquire 78 leads at a cost of 46.08 per lead, which is above the 35 target.',
    );
  });

  it('leaves a sentence that makes no pace claim exactly as it was', () => {
    const plain = 'Leads +34% · cost per result -10% · 11% over target';
    expect(stripPaceClaim(plain)).toBe(plain);
  });

  it('drops only the pace clause when it comes first', () => {
    expect(stripPaceClaim('Pacing is on track and cost per lead is 12% over target.')).toBe(
      'Cost per lead is 12% over target.',
    );
    expect(stripPaceClaim('On track for the month, the portfolio spent 3594 on 78 leads.')).toBe(
      'The portfolio spent 3594 on 78 leads.',
    );
  });

  it('knows the synonyms the model reaches for', () => {
    for (const claim of [
      'is under pace',
      'is overpacing',
      'is ahead of pace',
      'remains on schedule',
      'is pacing well',
      'is behind plan',
    ]) {
      expect(stripPaceClaim(`Cost per lead is 46, above the 35 target, and ${claim}.`)).toBe(
        'Cost per lead is 46, above the 35 target.',
      );
    }
  });

  it('drops a dotted item in the deterministic sentence', () => {
    expect(stripPaceClaim('Leads +34% · 11% over target · on track')).toBe(
      'Leads +34% · 11% over target',
    );
  });

  it('returns an empty string when the sentence was nothing but the claim', () => {
    expect(stripPaceClaim('The portfolio is on track.')).toBe('');
  });
});
