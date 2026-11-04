import { describe, expect, it } from 'bun:test';
import type { HomeProfileRow } from '../objectives';
import { homeReadGoalOf } from './readGoal';

const row = (scope: string, over: Partial<HomeProfileRow> = {}): HomeProfileRow => ({
  brand_id: 'b1',
  scope,
  source: 'user',
  objectives: [{ id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' }],
  ...over,
});

describe('homeReadGoalOf — the goal a Home read speaks in', () => {
  it('the goal the team saved wins over what the board measured', () => {
    expect(homeReadGoalOf([row('brand')], 'leads')).toEqual({
      objective: { id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' },
      source: 'team',
      labelIsInferred: false,
    });
  });

  it('with none saved, the goal the board resolved from the month’s results', () => {
    expect(homeReadGoalOf([], 'purchase_value')).toEqual({
      objective: {
        id: 'purchase_value',
        label: 'Revenue',
        metric: 'purchase_value',
        role: 'primary',
      },
      source: 'results',
      labelIsInferred: true,
    });
  });

  it('a row saved for one ad account is not the brand’s goal', () => {
    expect(homeReadGoalOf([row('act_1')], 'leads')?.objective.metric).toBe('leads');
    expect(homeReadGoalOf([row('act_1')], undefined)).toBeNull();
  });

  it('a saved row with no primary leads with its first, as the Goal tile does', () => {
    const goal = homeReadGoalOf(
      [
        row('brand', {
          objectives: [{ id: 'leads', label: 'Leads', metric: 'leads', role: 'secondary' }],
        }),
      ],
      undefined,
    );
    expect(goal?.objective.metric).toBe('leads');
  });

  it('nobody saved one and nothing was measured: the goal is unknown, never guessed', () => {
    expect(homeReadGoalOf([], undefined)).toBeNull();
    expect(homeReadGoalOf([], 'not_a_metric')).toBeNull();
  });
});
