import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { GlossaryTooltip } from './GlossaryTooltip';
import { GLOSSARY_TERMS } from './terms';

afterEach(cleanup);

describe('GlossaryTooltip', () => {
  it('renders the canonical term name when no children are given', () => {
    const { getByText } = render(<GlossaryTooltip termKey="dco" />);
    expect(getByText('DCO')).toBeTruthy();
  });

  it('renders custom label children in place of the default term name', () => {
    const { getByText } = render(<GlossaryTooltip termKey="roas">return on spend</GlossaryTooltip>);
    expect(getByText('return on spend')).toBeTruthy();
  });

  it('exposes the definition to assistive tech via aria-describedby', () => {
    const { container } = render(<GlossaryTooltip termKey="mcp" />);
    const trigger = container.querySelector('[aria-describedby]');
    expect(trigger).not.toBeNull();
    const descriptionId = trigger?.getAttribute('aria-describedby') ?? '';
    expect(descriptionId).not.toBe('');
    const description = document.getElementById(descriptionId);
    expect(description?.textContent).toContain(GLOSSARY_TERMS.mcp.short);
  });
});
