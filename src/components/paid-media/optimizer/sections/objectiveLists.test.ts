import { describe, expect, it } from 'bun:test';
import { OptimizationObjectiveSchema } from '@continuum/contracts';

import { OBJECTIVES } from './suggestionModel';

// Two screens let a person set an objective: the wizard on create and the manage panel on
// edit. They drew from different sources, so the panel offered `clicks` and the wizard did
// not — an operator could move a live portfolio onto an objective nobody can create. Both
// now read OBJECTIVES, and this holds the list honest about what it is.
describe('the objective list both screens offer', () => {
  it('withholds `clicks`, which is the engine fallback and not a thing anyone buys', () => {
    expect(OBJECTIVES).not.toContain('clicks');
  });

  it('offers every other member of the enum, so nothing storable is unreachable', () => {
    const withheld = OptimizationObjectiveSchema.options.filter(
      (objective) => !OBJECTIVES.includes(objective),
    );
    expect(withheld).toEqual(['clicks']);
  });

  it('offers only real enum members', () => {
    for (const objective of OBJECTIVES) {
      expect(OptimizationObjectiveSchema.safeParse(objective).success).toBe(true);
    }
  });
});
