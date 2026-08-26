/**
 * The edge-drop picker's Base UI structure. Both failures it guards were invisible in
 * types and only ever appeared at runtime:
 *   · `DropdownMenuLabel` is Base UI's `Menu.GroupLabel`, which reads its group's context
 *     and THROWS outside a `Menu.Group` — the picker rendered nothing at all;
 *   · a `<div>` render element with `nativeButton` left at its default makes Base UI warn
 *     on every drop.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { SourceDropCandidate } from '../hooks/useEdgeDropNode';
import { SourceDropNodePicker } from './SourceDropNodePicker';

const CANDIDATES: SourceDropCandidate[] = [
  { nodeType: 'nanoGen', label: 'Image Block' },
  { nodeType: 'videoGen', label: 'Video Block' },
  { nodeType: 'string', label: 'Text Block' },
];

function renderPicker(overrides: { onSelect?: (type: string) => void } = {}) {
  const onSelect = overrides.onSelect ?? (() => undefined);
  return render(
    <SourceDropNodePicker
      candidates={CANDIDATES}
      screenPosition={{ x: 120, y: 240 }}
      onSelect={onSelect as (type: SourceDropCandidate['nodeType']) => void}
      onDismiss={() => undefined}
    />,
  );
}

afterEach(cleanup);

describe('SourceDropNodePicker', () => {
  test('renders its label and one item per candidate', async () => {
    renderPicker();

    expect(await screen.findByText('Connect to…')).toBeTruthy();
    for (const candidate of CANDIDATES) {
      expect(await screen.findByText(candidate.label)).toBeTruthy();
    }
  });

  test('invents no candidate of its own', async () => {
    renderPicker();
    await screen.findByText('Connect to…');
    expect(screen.getAllByRole('menuitem').length).toBe(CANDIDATES.length);
  });

  test('picking an item reports the node type the caller must create', async () => {
    // Base UI's `Menu.Item` has no `onSelect`; the shared `DropdownMenuItem` translates it
    // to `onClick`. This picker is named in that translation's comment as one of the call
    // sites where the prop silently never fired.
    const picked: string[] = [];
    renderPicker({ onSelect: (type) => picked.push(type) });

    fireEvent.click(await screen.findByText('Video Block'));
    expect(picked).toEqual(['videoGen']);
  });

  test('emits no native-button warning for its positioning marker', async () => {
    const warn = mock(() => undefined);
    const error = mock(() => undefined);
    const realWarn = console.warn;
    const realError = console.error;
    console.warn = warn as unknown as typeof console.warn;
    console.error = error as unknown as typeof console.error;
    try {
      renderPicker();
      await screen.findByText('Connect to…');
    } finally {
      console.warn = realWarn;
      console.error = realError;
    }

    const said = [...warn.mock.calls, ...error.mock.calls].flat().map(String).join('\n');
    expect(said).not.toContain('nativeButton');
    expect(said).not.toContain('native <button>');
  });
});
