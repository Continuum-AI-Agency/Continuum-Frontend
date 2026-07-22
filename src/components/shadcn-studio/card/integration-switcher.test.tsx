import { describe, expect, it } from 'bun:test';
import { ReaderIcon } from '@radix-ui/react-icons';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import {
  IntegrationSwitcher,
  type IntegrationSwitcherData,
  type IntegrationSwitcherTab,
} from './integration-switcher';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

describe('IntegrationSwitcher', () => {
  it('renders the default integration tabs and switches the item list', () => {
    const { container } = render(<IntegrationSwitcher />);

    const githubTab = screen.getByText('GitHub').closest('button');
    const figmaTab = screen.getByText('Figma').closest('button');
    expect(githubTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('fix-checkout-process')).toBeTruthy();
    expect(container.querySelector("[data-active-tab='true']")).toBe(githubTab);

    fireEvent.click(figmaTab as HTMLButtonElement);

    expect(githubTab.getAttribute('aria-selected')).toBe('false');
    expect(figmaTab?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('design-system-kit')).toBeTruthy();
  });

  it('accepts custom tabs and data', () => {
    const integrations: IntegrationSwitcherTab[] = [
      { id: 'alpha', name: 'Alpha', icon: ReaderIcon },
      { id: 'beta', name: 'Beta', icon: ReaderIcon },
    ];
    const data: IntegrationSwitcherData = {
      alpha: [{ id: 'A-1', title: 'alpha-brief', icon: ReaderIcon, status: 'checked' }],
      beta: [{ id: 'B-1', title: 'beta-handoff', icon: ReaderIcon, status: 'copy' }],
    };

    render(
      <IntegrationSwitcher
        integrations={integrations}
        data={data}
        defaultActiveIntegration="beta"
      />,
    );

    expect(screen.getByText('Beta').closest('button')?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('beta-handoff')).toBeTruthy();
    expect(document.querySelector("button[aria-label='Copy item']")).toBeTruthy();
  });
});
