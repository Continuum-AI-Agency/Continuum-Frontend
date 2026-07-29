// The whole reason the rail uses the StableTabs fork is that the inactive panel
// must stay mounted. A plain Radix Tabs swap would unmount the inspector and
// throw away its scroll position, focus and in-flight edit, so that is what this
// spec pins down.

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { type RightRailTab, RightRailTabs } from './RightRailTabs';

afterEach(cleanup);

function MountCounter({ label }: { label: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    setText((current) => `${current}mounted`);
  }, []);
  return (
    <div>
      <span>{label}</span>
      <span data-testid={`${label}-mounts`}>{text}</span>
    </div>
  );
}

function ControlledRail() {
  const [tab, setTab] = useState<RightRailTab>('inspector');
  return (
    <RightRailTabs
      tab={tab}
      onTabChange={setTab}
      inspector={<MountCounter label="inspector-body" />}
      runs={<MountCounter label="runs-body" />}
    />
  );
}

// A hidden panel has no computable accessible name, so the panels are located
// by the body each one was handed.
const panelFor = (tab: RightRailTab): HTMLElement => {
  const panel = screen
    .getAllByRole('tabpanel', { hidden: true })
    .find((candidate) => candidate.textContent?.includes(`${tab}-body`));
  if (!panel) throw new Error(`No ${tab} tab panel rendered`);
  return panel;
};

describe('RightRailTabs', () => {
  test('opens on the inspector with the runs panel present but hidden', () => {
    render(<ControlledRail />);

    expect(panelFor('inspector').hasAttribute('hidden')).toBe(false);
    expect(panelFor('runs').hasAttribute('hidden')).toBe(true);
    expect(screen.getByText('runs-body')).toBeTruthy();
  });

  test('switching to Runs reveals it without remounting the inspector', () => {
    render(<ControlledRail />);

    expect(screen.getByTestId('inspector-body-mounts').textContent).toBe('mounted');

    fireEvent.mouseDown(screen.getByRole('tab', { name: /runs/ }), { button: 0 });

    expect(panelFor('runs').hasAttribute('hidden')).toBe(false);
    expect(panelFor('inspector').hasAttribute('hidden')).toBe(true);
    // A remount would reset the effect-written marker back to a single 'mounted'
    // after re-running; an unmount/remount cycle would clear it first.
    expect(screen.getByTestId('inspector-body-mounts').textContent).toBe('mounted');
    expect(screen.getByText('inspector-body')).toBeTruthy();
  });

  test('reports the chosen tab to its owner', () => {
    const onTabChange = mock((_tab: RightRailTab) => {});
    render(
      <RightRailTabs
        tab="inspector"
        onTabChange={onTabChange}
        inspector={<span>inspector-body</span>}
        runs={<span>runs-body</span>}
      />,
    );

    fireEvent.mouseDown(screen.getByRole('tab', { name: /runs/ }), { button: 0 });

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange.mock.calls[0]?.[0]).toBe('runs');
  });
});
