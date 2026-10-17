import { describe, expect, it } from 'bun:test';
import { render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ThemeToggleGlyph, ThemeToggleText } from './ThemeToggleGlyph';

// PP-L1-hydration-mismatch-on-scale: the server has no DOM and renders appearance 'light';
// the client, whose root already carries html.dark, renders 'dark'. The toggle's markup must
// therefore be the same for both appearances on the server, and only choose in JS once hydrated.

describe('ThemeToggleGlyph', () => {
  it('renders the same server markup whatever the appearance', () => {
    const light = renderToStaticMarkup(<ThemeToggleGlyph appearance="light" reduce={null} />);
    const dark = renderToStaticMarkup(<ThemeToggleGlyph appearance="dark" reduce={null} />);
    expect(dark).toBe(light);
    expect(light).toContain('lucide-sun');
    expect(light).toContain('lucide-moon');
  });

  it('lets the stylesheet pick the glyph before hydration', () => {
    const html = renderToStaticMarkup(<ThemeToggleGlyph appearance="light" reduce={null} />);
    expect(html).toMatch(/lucide-sun[^"]*hidden dark:inline-block/);
    expect(html).toMatch(/lucide-moon[^"]*dark:hidden/);
  });

  it('shows the one glyph the mode switches to once hydrated', () => {
    const { container } = render(<ThemeToggleGlyph appearance="dark" reduce />);
    expect(container.querySelector('.lucide-sun')).toBeTruthy();
    expect(container.querySelector('.lucide-moon')).toBeNull();
  });
});

describe('ThemeToggleText', () => {
  it('renders both labels on the server and one once hydrated', () => {
    const light = renderToStaticMarkup(<ThemeToggleText appearance="light" />);
    const dark = renderToStaticMarkup(<ThemeToggleText appearance="dark" />);
    expect(dark).toBe(light);
    expect(light).toContain('Dark mode');
    expect(light).toContain('Light mode');
    const { container } = render(<ThemeToggleText appearance="dark" />);
    expect(container.textContent).toBe('Light mode');
  });
});
