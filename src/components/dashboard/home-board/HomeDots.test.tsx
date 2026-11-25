import { afterEach, describe, expect, it } from 'bun:test';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { type HomeDot, HomeDots } from './HomeDots';
import { HomeInspectionProvider } from './HomePresentationContext';
import { resolveHomePresentation } from './homePresentation';

afterEach(cleanup);

const observations: HomeDot[] = [
  {
    id: '2026-11-12',
    label: 'Nov 12',
    value: '0 MXN',
    number: 0,
    detail: 'Revenue · account window',
  },
  { id: '2026-11-15', label: 'Nov 15', value: '42 MXN', number: 42 },
  { id: 'tracking', label: 'Tracking', value: 'Not read', tone: 'unknown' },
];

describe('Home dot inspection', () => {
  it('shows operational records as named status rows without changing their values', () => {
    const screen = render(<HomeDots label="Recorded outcomes" items={observations} rows />);
    const zero = screen.getByRole('button', { name: /Nov 12: 0 MXN/ });
    expect(zero.textContent).toContain('Nov 12');
    expect(zero.textContent).toContain('0 MXN');
    expect(screen.getByRole('button', { name: /Tracking: Not read/ }).textContent).toContain(
      'Not read',
    );
  });
  it('offers every dated result in a list when nearby chart targets overlap', async () => {
    const screen = render(<HomeDots label="Daily revenue" items={observations} trend />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show list' }));
    });
    expect(screen.getByRole('button', { name: /Nov 12: 0 MXN/ }).textContent).toContain('0 MXN');
    expect(screen.getByRole('button', { name: /Nov 15: 42 MXN/ }).textContent).toContain('Nov 15');
    expect(screen.getByRole('button', { name: /Tracking: Not read/ })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show plot' }));
    });
    expect(screen.container.querySelectorAll('[data-home-dot-id]')).toHaveLength(3);
  });
  it('offers the same clustered records as a reachable list without changing their evidence', async () => {
    const records: HomeDot[] = [
      { id: 'ad-a', label: 'First ad', value: 'Winner', group: 'Winner', x: 0.2 },
      { id: 'ad-b', label: 'Second ad', value: 'Winner', group: 'Winner', x: 0.201 },
    ];
    const screen = render(
      <HomeDots
        label="Ads"
        items={records}
        groups={['Winner']}
        xAxis={{ label: 'Share of spend', format: (value) => `${value * 100}%` }}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show list' }));
    });
    expect(
      [...screen.container.querySelectorAll('[data-home-dot-id]')].map((node) =>
        node.getAttribute('data-home-dot-id'),
      ),
    ).toEqual(['ad-a', 'ad-b']);
    const second = screen.getByRole('button', { name: 'Second ad: Winner' });
    expect(second.style.left).toBe('');
    await act(async () => {
      fireEvent.click(second);
    });
    expect(second.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show plot' }));
    });
    expect(
      screen.getByRole('button', { name: 'Second ad: Winner' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });
  it('keeps one held record across tiles and lets a new click replace it', async () => {
    const screen = render(
      <HomeInspectionProvider>
        <HomeDots
          label="First tile"
          items={[{ id: 'a', label: 'First record', value: 'Passing' }]}
        />
        <HomeDots
          label="Second tile"
          items={[{ id: 'b', label: 'Second record', value: 'Needs attention' }]}
        />
      </HomeInspectionProvider>,
    );
    const first = screen.getByRole('button', { name: 'First record: Passing' });
    const second = screen.getByRole('button', { name: 'Second record: Needs attention' });
    await act(async () => {
      fireEvent.click(first);
      fireEvent.pointerEnter(second);
    });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(second.getAttribute('data-active')).toBeNull();
    await act(async () => {
      fireEvent.click(second);
    });
    expect(first.getAttribute('aria-pressed')).toBe('false');
    expect(second.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.keyDown(second, { key: 'Escape' });
    });
    expect(second.getAttribute('aria-pressed')).toBe('false');
  });
  it('inspects real zero values on hover and holds a clicked observation until Escape', async () => {
    const screen = render(<HomeDots items={observations} label="Revenue" trend />);
    const zero = screen.getByRole('button', { name: /Nov 12: 0 MXN/ });
    const other = screen.getByRole('button', { name: /Nov 15: 42 MXN/ });
    await act(async () => {
      fireEvent.pointerEnter(zero);
    });
    expect(screen.getByRole('status').textContent).toContain('Nov 12 · 0 MXN');
    expect(zero.getAttribute('data-home-dot-number')).toBe('0');
    await act(async () => {
      fireEvent.click(zero);
      fireEvent.pointerLeave(zero);
      fireEvent.pointerEnter(other);
    });
    expect(screen.getByRole('status').textContent).toContain('Nov 12 · 0 MXN');
    expect(zero.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.keyDown(zero, { key: 'Escape' });
    });
    expect(zero.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('status').textContent).toContain('Hover or focus');
  });

  it('supports keyboard inspection, arrow navigation and unread states', async () => {
    const screen = render(<HomeDots items={observations} label="Checks" />);
    const buttons = screen.getAllByRole('button');
    await act(async () => {
      buttons[0]?.focus();
      fireEvent.keyDown(buttons[0] as HTMLElement, { key: 'ArrowRight' });
    });
    expect(document.activeElement).toBe(buttons[1]);
    expect(screen.getByRole('status').textContent).toContain('42 MXN');
    await act(async () => {
      fireEvent.keyDown(buttons[1] as HTMLElement, { key: 'ArrowRight' });
    });
    expect(document.activeElement).toBe(buttons[2]);
    expect(buttons[2]?.getAttribute('data-home-dot-tone')).toBe('unknown');
    expect(screen.getByRole('status').textContent).toContain('Not read');
  });

  it('clears a held selection when tapped again, and describes truncation honestly', async () => {
    const screen = render(<HomeDots items={observations} label="Checks" limit={2} />);
    const button = screen.getAllByRole('button')[0] as HTMLElement;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Showing 2 of 3. Open the module for all records.')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('clears a held record with Escape after focus moves outside the inspector', async () => {
    const screen = render(
      <>
        <HomeDots items={observations} label="Checks" />
        <button type="button">Elsewhere</button>
      </>,
    );
    const point = screen.getByRole('button', { name: /Nov 12: 0 MXN/ });
    await act(async () => {
      fireEvent.click(point);
      screen.getByRole('button', { name: 'Elsewhere' }).focus();
    });
    expect(point.getAttribute('aria-pressed')).toBe('true');
    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(point.getAttribute('aria-pressed')).toBe('false');
  });

  it('names an empty read without synthesizing a zero observation', () => {
    const screen = render(
      <HomeDots items={[]} label="Revenue" empty="Daily history not reported." />,
    );
    expect(screen.getByText('Daily history not reported.')).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('positions sparse dates by their actual gap and labels the observed scale', () => {
    const day = 86_400_000;
    const items = [
      { id: 'a', label: 'Nov 1', value: '0 MXN', number: 0, x: day },
      { id: 'b', label: 'Nov 2', value: '20 MXN', number: 20, x: day * 2 },
      { id: 'c', label: 'Nov 8', value: '80 MXN', number: 80, x: day * 8 },
    ];
    const screen = render(
      <HomeDots items={items} label="Daily revenue" trend valueLabel={(value) => `${value} MXN`} />,
    );
    const points = [...screen.container.querySelectorAll<HTMLButtonElement>('[data-home-dot-id]')];
    const left = points.map((point) => Number.parseFloat(point.style.left));
    expect((left[2]! - left[1]!) / (left[1]! - left[0]!)).toBeCloseTo(6);
    expect(screen.getByText('80 MXN')).toBeTruthy();
    expect(screen.getByText('Reported day')).toBeTruthy();
  });

  it('anchors the inspected record with its actual period and source freshness', async () => {
    const screen = render(
      <HomeDots
        label="Ads"
        items={[
          {
            id: 'ad-1',
            label: 'Recorded ad',
            value: 'Winner',
            group: 'Winner',
            x: 0.2,
            period: '7d reporting window',
            freshness: 'As of Nov 18',
          },
        ]}
        groups={['Winner']}
        xAxis={{ label: 'Share of spend', format: (value) => `${value * 100}%` }}
      />,
    );
    const point = screen.getByRole('button', { name: 'Recorded ad: Winner' });
    await act(async () => {
      point.focus();
    });
    const callout = await screen.findByRole('tooltip');
    expect(callout.textContent).toContain('7d reporting window');
    expect(callout.textContent).toContain('As of Nov 18');
    expect(point.style.top).toBe('50%');
    await act(async () => {
      fireEvent.keyDown(point, { key: 'Escape' });
    });
  });
});

describe('Home draft route gate', () => {
  it('accepts the exact development variant only', () => {
    expect(resolveHomePresentation('dots', 'development')).toBe('dots');
    expect(resolveHomePresentation('dots', 'production')).toBe('current');
    expect(resolveHomePresentation('dots', 'test')).toBe('current');
    expect(resolveHomePresentation(['dots'], 'development')).toBe('current');
    expect(resolveHomePresentation(undefined, 'development')).toBe('current');
  });
});
