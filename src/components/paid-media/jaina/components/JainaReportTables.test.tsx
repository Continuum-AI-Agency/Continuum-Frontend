import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { JainaReportTables, parseNumericCell } from './JainaReportTables';

const TOP_ADS = {
  title: 'Top ads by spend',
  notes: 'Ranked by spend over the reporting window.',
  headers: ['Ad', 'Spend', 'ROAS'],
  rows: [
    ['Spring Hero — 9x16', '$9,840 USD', '4.1x'],
    ['Testimonial — Ana', '$12,412 USD', '3.8x'],
    ['UGC Unboxing', '$1,021 USD', '2.9x'],
  ],
};

afterEach(cleanup);

function firstColumn() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent);
}

describe('parseNumericCell', () => {
  it('reads the number inside preformatted cells and refuses text', () => {
    expect(parseNumericCell('$9,840 USD')).toBe(9840);
    expect(parseNumericCell('-1.4%')).toBe(-1.4);
    expect(parseNumericCell('-$12.50')).toBe(-12.5);
    expect(parseNumericCell('4.1x')).toBe(4.1);
    expect(parseNumericCell('Spring Hero — 9x16')).toBeNull();
    expect(parseNumericCell('2026-03-01')).toBeNull();
  });
});

describe('JainaReportTables', () => {
  it('renders title, notes and the preformatted cells', () => {
    render(<JainaReportTables tables={[TOP_ADS]} />);

    expect(screen.getAllByText('Top ads by spend').length).toBeGreaterThan(0);
    expect(screen.getByText('Ranked by spend over the reporting window.')).toBeTruthy();
    expect(screen.getByText('$12,412 USD')).toBeTruthy();
  });

  it('sorts a currency column by its number, not its text', () => {
    render(<JainaReportTables tables={[TOP_ADS]} />);
    expect(firstColumn()).toEqual(['Spring Hero — 9x16', 'Testimonial — Ana', 'UGC Unboxing']);

    fireEvent.click(screen.getByRole('button', { name: /Spend/ }));
    expect(firstColumn()).toEqual(['Testimonial — Ana', 'Spring Hero — 9x16', 'UGC Unboxing']);

    fireEvent.click(screen.getByRole('button', { name: /Spend/ }));
    expect(firstColumn()).toEqual(['UGC Unboxing', 'Spring Hero — 9x16', 'Testimonial — Ana']);
  });

  it('copies the table as CSV with the cells as displayed', async () => {
    const writeText = mock(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<JainaReportTables tables={[TOP_ADS]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy as CSV' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe(
      [
        'Ad,Spend,ROAS',
        'Spring Hero — 9x16,"$9,840 USD",4.1x',
        'Testimonial — Ana,"$12,412 USD",3.8x',
        'UGC Unboxing,"$1,021 USD",2.9x',
      ].join('\n'),
    );
  });

  it('renders nothing when every table is empty', () => {
    const { container } = render(<JainaReportTables tables={[{ headers: ['A'], rows: [] }]} />);
    expect(container.innerHTML).toBe('');
  });
});
