import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';

import { Tabs, TabsList, TabsTrigger } from './tabs';

// PP-L1V-portfolios-tab-indicator-stays-on-automations: the line tabs crossfaded their label
// colour and their underline over 150ms (`transition-all`, `after:transition-opacity`). When the
// panel behind a tab is heavy (Portfolios' table) the main thread stalls inside that crossfade,
// and for a beat the tab you LEFT still reads as the active one while aria-selected has already
// moved. The indicator is state, not motion: it switches in the same frame as aria-selected.

function SubNav() {
  const [value, setValue] = useState('overview');
  return (
    <Tabs onValueChange={(next) => setValue(next as string)} value={value}>
      <TabsList variant="line">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
        <TabsTrigger value="automations">Automations</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

describe('TabsTrigger indicator', () => {
  afterEach(() => cleanup());

  it('never animates the active state — no transition on colour or the underline', () => {
    render(<SubNav />);
    for (const tab of screen.getAllByRole('tab')) {
      const classes = tab.className.split(/\s+/);
      expect(classes.filter((name) => /(^|:)transition(-|$)/.test(name))).toEqual([]);
    }
  });

  it('moves the foreground underline with aria-selected', () => {
    render(<SubNav />);
    fireEvent.click(screen.getByRole('tab', { name: 'Automations' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Portfolios' }));
    const active = screen.getAllByRole('tab').filter((tab) => tab.hasAttribute('data-active'));
    expect(active.map((tab) => tab.textContent)).toEqual(['Portfolios']);
    expect(active[0].getAttribute('aria-selected')).toBe('true');
    expect(active[0].className).toContain('after:bg-foreground');
    expect(active[0].className).not.toMatch(/after:bg-primary|data-active:bg-primary/);
  });
});
