import { describe, expect, it } from 'bun:test';
import { TWO_WINNERS } from './__fixtures__/organicWinners';
import { FLYWHEEL_LANES, liftLine, winnerTitle } from './flywheelModel';

describe('the flywheel lanes', () => {
  it('has three lanes in the design’s order, the last one not available yet', () => {
    expect(FLYWHEEL_LANES.map((lane) => lane.id)).toEqual([
      'organic-to-paid',
      'paid-to-creative',
      'creative-to-organic',
    ]);
    expect(FLYWHEEL_LANES.map((lane) => lane.available)).toEqual([true, true, false]);
  });
});

describe('winnerTitle', () => {
  it('is the stored hook, else the format and the media id', () => {
    expect(winnerTitle(TWO_WINNERS.winners[0])).toBe('Tu primer mes por $12');
    expect(winnerTitle(TWO_WINNERS.winners[1])).toBe('Carousel 18000000000000002');
  });
});

describe('liftLine', () => {
  it('cites only the lifts the read holds', () => {
    expect(liftLine(TWO_WINNERS.winners[0])).toBe(
      'Reach 4.2× · engagement 1.6× the account median',
    );
    expect(liftLine(TWO_WINNERS.winners[1])).toBe('Engagement 2.4× the account median');
  });

  it('is null with no lift at all', () => {
    expect(
      liftLine({ ...TWO_WINNERS.winners[0], reachLift: null, engagementRateLift: null }),
    ).toBeNull();
  });
});
