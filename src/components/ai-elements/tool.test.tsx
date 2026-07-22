import { afterEach, describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';

import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from './tool';

Object.assign(global.window, {
  SyntaxError: globalThis.SyntaxError,
  Error: globalThis.Error,
  TypeError: globalThis.TypeError,
});

function renderTool(input: unknown, output: unknown) {
  return render(
    <Tool type="searchMediaLibrary" state="output-available" defaultOpen>
      <ToolHeader title="Search media library" />
      <ToolContent>
        <ToolInput value={input} />
        <ToolOutput value={output} />
      </ToolContent>
    </Tool>,
  );
}

describe('ai-elements/tool humanized payloads', () => {
  afterEach(() => cleanup());

  it('renders a flat scalar object as label/value rows (no raw JSON dump)', () => {
    const { container } = renderTool({ query: 'pepperoni pizza', limit: 8 }, 'ok');

    // Keys and values appear as readable rows.
    expect(screen.getByText('query')).toBeDefined();
    expect(screen.getByText('pepperoni pizza')).toBeDefined();
    expect(screen.getByText('limit')).toBeDefined();

    // A flat scalar input must NOT fall back to a <pre> JSON block.
    const inputDl = container.querySelector('dl');
    expect(inputDl).not.toBeNull();
  });

  it('falls back to indented JSON for nested structures', () => {
    const { container } = renderTool({ query: 'x' }, { data: { platform: 'instagram' } });
    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('instagram');
  });
});

describe('ai-elements/tool styling', () => {
  it('no longer carries @radix-ui/themes or dark-only utility classes', () => {
    const source = readFileSync(join(import.meta.dir, 'tool.tsx'), 'utf8');
    expect(source).not.toContain('@radix-ui/themes');
    expect(source).not.toContain('text-secondary');
    expect(source).not.toContain('white/5');
    expect(source).not.toContain('bg-black/20');
  });
});
