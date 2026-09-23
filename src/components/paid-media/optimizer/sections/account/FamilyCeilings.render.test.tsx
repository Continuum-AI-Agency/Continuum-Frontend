import { afterEach, describe, expect, it, mock } from 'bun:test';
import { APPROVABLE_FAMILIES } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

import { FamilyCeilings } from './FamilyCeilings';

afterEach(cleanup);

const DEFAULTS = { budget: 'recommend', creative_swap: 'recommend', structure: 'recommend' };

describe('what this account may do on its own', () => {
  // It was a folded `<details>` strip on Overview; a control that has to be found before it
  // can be used stays on its defaults. On the Automations tab it is open on arrival.
  it('is an open panel, not a fold', () => {
    const { getByTestId, container } = render(
      <FamilyCeilings current={{}} defaults={DEFAULTS} onSetFamily={() => {}} />,
    );
    expect(container.querySelector('details')).toBeNull();
    expect(getByTestId('family-ceilings').textContent).toContain(
      'What this account is allowed to do on its own',
    );
    expect(container.querySelectorAll('[aria-pressed]').length).toBeGreaterThan(0);
  });

  it('offers every approvable family, and never measurement', () => {
    const { container } = render(
      <FamilyCeilings current={{}} defaults={DEFAULTS} onSetFamily={() => {}} />,
    );
    const rendered = [...container.querySelectorAll('[data-family]')].map((n) =>
      n.getAttribute('data-family'),
    );
    expect(rendered).toEqual([...APPROVABLE_FAMILIES]);
    expect(rendered).not.toContain('measurement');
  });

  it('shows the shipped value in force, and says nobody chose it', () => {
    const { container, getAllByTestId } = render(
      <FamilyCeilings current={{}} defaults={DEFAULTS} onSetFamily={() => {}} />,
    );
    const budget = container.querySelector('[data-family="budget"]');
    const pressed = budget?.querySelector('[aria-pressed="true"]');
    expect(pressed?.getAttribute('data-state-option')).toBe('recommend');
    // A row nobody has touched must not read as a decision someone made.
    expect(getAllByTestId('family-shipped').length).toBe(APPROVABLE_FAMILIES.length);
  });

  it('prefers what someone actually chose over the shipped value', () => {
    const { container, queryAllByTestId } = render(
      <FamilyCeilings
        current={{ budget: 'autopilot' }}
        defaults={DEFAULTS}
        onSetFamily={() => {}}
      />,
    );
    const budget = container.querySelector('[data-family="budget"]');
    expect(budget?.querySelector('[aria-pressed="true"]')?.getAttribute('data-state-option')).toBe(
      'autopilot',
    );
    expect(queryAllByTestId('family-shipped').length).toBe(APPROVABLE_FAMILIES.length - 1);
  });

  it('asks for the state that was clicked, for the family it belongs to', () => {
    const onSetFamily = mock((_family: string, _state: string) => {});
    const { container } = render(
      <FamilyCeilings current={{}} defaults={DEFAULTS} onSetFamily={onSetFamily} />,
    );
    const budget = container.querySelector('[data-family="budget"]');
    const off = budget?.querySelector('[data-state-option="off"]') as HTMLElement;
    fireEvent.click(off);
    expect(onSetFamily).toHaveBeenCalledWith('budget', 'off');
  });

  it('says so when a change was refused, instead of looking like it took', () => {
    const { getByTestId } = render(
      <FamilyCeilings
        current={{}}
        defaults={DEFAULTS}
        error="Could not change what this family may do: function does not exist"
        onSetFamily={() => {}}
      />,
    );
    expect(getByTestId('family-error').textContent).toContain('function does not exist');
  });

  it('falls back to suggesting when neither a choice nor a shipped value parses', () => {
    const { container } = render(
      <FamilyCeilings current={{ budget: 'nonsense' }} defaults={{}} onSetFamily={() => {}} />,
    );
    const budget = container.querySelector('[data-family="budget"]');
    expect(budget?.querySelector('[aria-pressed="true"]')?.getAttribute('data-state-option')).toBe(
      'recommend',
    );
  });
});
