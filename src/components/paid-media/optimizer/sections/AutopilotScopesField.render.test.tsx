import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { AutopilotScopesField } from './AutopilotScopesField';

afterEach(cleanup);

describe('AutopilotScopesField', () => {
  it('renders the five scopes with the defaults and reports a toggle as a partial patch', () => {
    const changes: Array<[string, boolean]> = [];
    const { container, getByRole } = render(
      <AutopilotScopesField
        noActor={false}
        onChange={(scope, enabled) => changes.push([scope, enabled])}
        portfolioId="p1"
        savingScope={null}
        scopes={null}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Budget moves');
    expect(text).toContain('Creative rotation');
    expect(text).toContain('Replace an audience');
    expect(text).toContain('Add an audience');
    expect(text).toContain('Flash creatives');
    expect(text).toContain('created paused');
    const budget = getByRole('switch', { name: 'Budget moves' });
    expect(budget.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(getByRole('switch', { name: 'Flash creatives' }));
    expect(changes).toEqual([['new_creatives', true]]);
  });
  it('warns when nobody is recorded as the approver', () => {
    const { container } = render(
      <AutopilotScopesField
        noActor
        onChange={() => undefined}
        portfolioId="p1"
        savingScope={null}
        scopes={null}
      />,
    );
    expect(container.textContent).toContain('needs a person to act as');
  });
});
