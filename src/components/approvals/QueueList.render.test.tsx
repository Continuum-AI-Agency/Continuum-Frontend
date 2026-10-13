import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';

import type { RuleAction } from '@/lib/approvals/types';
import { QueueList } from './QueueList';

// PP-L1V-muted-caption-contrast-4.41: the focused row is tinted bg-accent/60 (#aca2ff over the
// card in light, #366c60 in dark), where the muted caption colour measures 2.89:1 / 2.36:1. The
// row keeps its tint; the captions on it read in the foreground ink (7.9:1 / 4.9:1).

const action = (id: string): RuleAction => ({
  id,
  status: 'PENDING',
  action_type: 'PAUSE_ADSET',
  scope_type: 'ADSET',
  scope_id: `adset-${id}`,
  action_payload: {},
  rule_name: 'CPA guard',
  created_at: '2026-10-12T10:00:00.000Z',
});

describe('QueueList — the focused row', () => {
  it('lifts every muted caption on the focused row to the foreground ink', () => {
    const { container } = render(
      <QueueList actions={[action('a'), action('b')]} focusedId="a" onFocus={() => {}} />,
    );
    const focused = container.querySelector('button[aria-current="true"]');
    expect(focused).toBeTruthy();
    expect(focused?.className).toContain('group');
    const muted = focused?.querySelectorAll('.text-muted-foreground') ?? [];
    expect(muted.length).toBeGreaterThan(0);
    for (const node of muted) {
      expect(node.className).toContain('group-aria-[current=true]:text-foreground');
    }
  });

  it('leaves the muted captions of an unfocused row on the muted colour alone', () => {
    const { container } = render(
      <QueueList actions={[action('a'), action('b')]} focusedId="a" onFocus={() => {}} />,
    );
    const rows = container.querySelectorAll('button');
    expect(rows[1]?.getAttribute('aria-current')).toBeNull();
    expect(rows[1]?.querySelector('.text-muted-foreground')).toBeTruthy();
  });
});
