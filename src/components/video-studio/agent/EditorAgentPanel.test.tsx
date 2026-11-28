import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { EditorSuggestions } from './EditorAgentPanel';

afterEach(cleanup);

const labels = () => screen.getAllByRole('button').map((button) => button.textContent);

describe('EditorSuggestions', () => {
  it('offers the first cut before a brief exists and sends its full prompt', () => {
    const onSend = mock();
    render(<EditorSuggestions firstCut disabled={false} onSend={onSend} />);
    expect(labels()).toEqual(['First cut: 3 variants', 'Captions']);
    fireEvent.click(screen.getByRole('button', { name: 'First cut: 3 variants' }));
    expect(onSend).toHaveBeenCalledWith(
      'Draft a first cut from this footage: 3 variants, 30 s each, with captions.',
    );
  });

  it('offers the edit chips once a brief exists and blocks them while running', () => {
    render(<EditorSuggestions firstCut={false} disabled onSend={() => {}} />);
    expect(labels()).toEqual(['Cut pauses', 'Captions']);
    // happy-dom does not inherit disabled from a fieldset; browsers do, so assert the fieldset.
    const chip = screen.getByRole('button', { name: 'Cut pauses' });
    expect(chip.closest('fieldset')?.disabled).toBe(true);
  });
});
