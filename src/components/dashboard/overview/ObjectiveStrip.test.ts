import { describe, expect, it } from 'bun:test';

import { costLabelFor } from './ObjectiveStrip';

describe('costLabelFor', () => {
  it('keeps the catalog label for an unrenamed goal', () => {
    expect(
      costLabelFor(
        { id: 'p', label: 'Purchases', metric: 'purchases', role: 'primary' },
        'Cost per purchase',
      ),
    ).toBe('Cost per purchase');
  });

  it('speaks in the client’s own word once a goal is renamed', () => {
    expect(
      costLabelFor(
        { id: 't', label: 'Tours booked', metric: 'purchases', role: 'primary' },
        'Cost per purchase',
      ),
    ).toBe('Cost per tour booked');
  });

  it('leaves money goals on their ratio label', () => {
    expect(
      costLabelFor({ id: 'r', label: 'Sales', metric: 'purchase_value', role: 'primary' }, 'ROAS'),
    ).toBe('ROAS');
  });
});
