import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from './engine-contracts';
import { eventsInWindow, recommendLookbackWindow } from './lookback';

function win(spend: number, leads: number): WindowMetrics {
  return { spend, leads, impressions: 0, clicks: 0, purchases: 0 } as WindowMetrics;
}

function snap(d7: number, d14: number, d30: number): AdSetSnapshot {
  return {
    id: 'a',
    status: 'active',
    currentBudget: 100,
    windows: { d3: win(10, 0), d7: win(70, d7), d14: win(140, d14) },
    archivalWindows: { d30: win(300, d30) },
  } as unknown as AdSetSnapshot;
}

describe('eventsInWindow', () => {
  it('reads d30 off archivalWindows, not windows', () => {
    expect(eventsInWindow([snap(1, 2, 3)], 'd30', 'leads')).toBe(3);
  });

  it('sums across ad sets', () => {
    expect(eventsInWindow([snap(5, 0, 0), snap(4, 0, 0)], 'd7', 'leads')).toBe(9);
  });

  it('is zero when the window is absent', () => {
    const bare = { id: 'a' } as unknown as AdSetSnapshot;
    expect(eventsInWindow([bare], 'd30', 'leads')).toBe(0);
  });
});

describe('recommendLookbackWindow', () => {
  // Responsiveness is the goal; sample size is the constraint. Shortest that clears wins.
  it('picks d7 when the short window already clears the floor', () => {
    const rec = recommendLookbackWindow([snap(50, 90, 200)], 'leads', 'leads');
    expect(rec.window).toBe('d7');
    expect(rec.events).toBe(50);
  });

  it('escalates to d14 when d7 is too thin', () => {
    const rec = recommendLookbackWindow([snap(1, 40, 90), snap(1, 40, 90)], 'leads', 'leads');
    expect(rec.window).toBe('d14');
    expect(rec.reason).toContain('14 days');
  });

  it('escalates to d30 when d7 and d14 are both too thin', () => {
    // floorMinSignals (2) x 2 ad sets = 4 required; d7 and d14 both total 2.
    expect(recommendLookbackWindow([snap(1, 1, 40), snap(1, 1, 40)], 'leads', 'leads').window).toBe(
      'd30',
    );
  });

  // The floor scales with ad-set count: 4 leads across 20 ad sets is not 4 leads across 2.
  it('holds a bigger portfolio to a higher bar for the same total', () => {
    const two = [snap(6, 6, 6), snap(0, 0, 0)];
    const many = Array.from({ length: 20 }, (_, i) => (i === 0 ? snap(6, 6, 6) : snap(0, 0, 0)));
    expect(recommendLookbackWindow(two, 'leads', 'leads').window).toBe('d7');
    expect(recommendLookbackWindow(many, 'leads', 'leads').window).toBe('d30');
  });

  // Thin data must not masquerade as a confident recommendation.
  it('falls back to d30 and says the evidence is short when nothing clears', () => {
    const rec = recommendLookbackWindow([snap(0, 0, 1)], 'leads', 'leads');
    expect(rec.window).toBe('d30');
    expect(rec.reason).toContain('below the');
    expect(rec.events).toBeLessThan(rec.required);
  });

  it('names the objective result label in the reason', () => {
    expect(recommendLookbackWindow([snap(50, 90, 200)], 'purchases', 'purchases').reason).toContain(
      'purchases',
    );
  });

  it('never divides by zero on an empty portfolio', () => {
    const rec = recommendLookbackWindow([], 'leads', 'leads');
    expect(rec.window).toBe('d30');
    expect(rec.events).toBe(0);
  });
});
