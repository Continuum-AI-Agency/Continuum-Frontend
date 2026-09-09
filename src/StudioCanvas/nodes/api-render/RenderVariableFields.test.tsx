/**
 * The geometry controls a template contract produces, one variable kind at a time.
 *
 * The rule these guard: a handle the graph rules refuse is an edge the canvas paints and
 * the render never receives, so which kinds get a handle comes from the contract's own
 * `isConnectableApiRenderVariable` — image, video and text — and NOT from a kind list
 * kept in the component. `number` and `enum` keep their controls instead.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import type { ApiRenderInputValue, ApiRenderVariable } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import React from 'react';
import { RenderVariableFields } from './RenderVariableFields';

const variable = (overrides: Partial<ApiRenderVariable> = {}): ApiRenderVariable => ({
  key: 'headline',
  label: 'Headline',
  kind: 'text',
  required: false,
  multiple: false,
  accept: [],
  options: [],
  description: null,
  reserved: false,
  ...overrides,
});

function renderFields(
  definitions: ApiRenderVariable[],
  extra: {
    values?: Record<string, ApiRenderInputValue>;
    brandId?: string | null;
    connectedKeys?: ReadonlySet<string>;
    mediaStatus?: ReadonlyMap<string, { connected: number; ready: number; picked: number }>;
    onChange?: (key: string, value: ApiRenderInputValue) => void;
    onClear?: (key: string) => void;
  } = {},
) {
  return render(
    <ReactFlowProvider>
      <RenderVariableFields
        definitions={definitions}
        values={extra.values}
        brandId={extra.brandId}
        connectedKeys={extra.connectedKeys}
        mediaStatus={extra.mediaStatus}
        onChange={extra.onChange ?? (() => undefined)}
        onClear={extra.onClear ?? (() => undefined)}
      />
    </ReactFlowProvider>,
  );
}

const handleFor = (key: string) => document.querySelector(`[data-handleid="variable-${key}"]`);

afterEach(cleanup);

describe('RenderVariableFields — enum geometry', () => {
  // The control is a Base UI Select, not a native <select>, so the placeholder is TEXT on the
  // trigger rather than an option inside the list. That removes the failure these tests were
  // written for outright — a native select paints option one as chosen while '' is what is
  // stored, and the field then reads "a" while the variable is still unanswered. Here an
  // unanswered enum has nothing selected and the trigger says so.
  test('an unanswered required enum reads as unanswered', async () => {
    renderFields([
      variable({ key: 'position', kind: 'enum', required: true, options: ['a', 'b'] }),
    ]);

    expect(screen.getByRole('combobox').textContent).toContain('Choose…');
  });

  test('a required enum shows the stored value once one is chosen', () => {
    renderFields(
      [variable({ key: 'position', kind: 'enum', required: true, options: ['a', 'b'] })],
      { values: { position: 'b' } },
    );

    expect(screen.getByRole('combobox').textContent).toContain('b');
  });

  test('offers exactly the options the template reflected, and no others', async () => {
    const options = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];
    renderFields([
      variable({
        key: 'watermark_position',
        label: 'Watermark Position',
        kind: 'enum',
        required: true,
        options,
      }),
    ]);

    fireEvent.click(screen.getByRole('combobox'));
    const items = await screen.findAllByRole('option');
    // Required, so there is no way back to unset and the list is exactly the reflected set.
    expect(items.map((item) => item.textContent)).toEqual(options);
  });

  // Clearing an optional variable is a real thing to want. The placeholder is not selectable
  // on this control, so the way back to unset has to be an item of its own — and choosing it
  // must CLEAR the key rather than store a sentinel, or the renderer receives "__unset__".
  test('an optional enum offers a way back to unset, and it clears', async () => {
    const cleared: string[] = [];
    const changed: string[] = [];
    renderFields([variable({ key: 'position', kind: 'enum', options: ['a', 'b'] })], {
      values: { position: 'a' },
      onClear: (key) => cleared.push(key),
      onChange: (key) => changed.push(key),
    });

    fireEvent.click(screen.getByRole('combobox'));
    const items = await screen.findAllByRole('option');
    expect(items.map((item) => item.textContent)).toEqual(['Not set…', 'a', 'b']);

    // Base UI commits a selection on pointerup, not on a synthetic click — the same gesture a
    // real pointer makes. Clearing must reach `onClear`; sending the sentinel through
    // `onChange` would put the literal string "__unset__" in front of the renderer.
    fireEvent.pointerDown(items[0]!);
    fireEvent.pointerUp(items[0]!);
    fireEvent.click(items[0]!);
    expect(cleared).toEqual(['position']);
    expect(changed).toEqual([]);
  });

  test('invents no picker when the value set never crossed the boundary', () => {
    // The legacy reflection strips the option list; a picker here would name choices the
    // renderer never did.
    renderFields([variable({ key: 'position', label: 'Position', kind: 'enum', options: [] })]);

    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  test('an enum takes no wire — a handle would replace the picker', () => {
    renderFields([variable({ key: 'position', kind: 'enum', options: ['a', 'b'] })]);
    expect(handleFor('position')).toBeNull();
  });
});

describe('RenderVariableFields — numeric geometry', () => {
  test('stays an editable number field with no handle', () => {
    const changes: Array<[string, string | number | boolean]> = [];
    renderFields([variable({ key: 'duration', label: 'Duration', kind: 'number' })], {
      values: { duration: 5 },
      onChange: (key, value) => changes.push([key, value]),
    });

    const field = screen.getByDisplayValue('5') as HTMLInputElement;
    expect(field.type).toBe('number');
    fireEvent.change(field, { target: { value: '12' } });
    expect(changes).toEqual([['duration', 12]]);
    expect(handleFor('duration')).toBeNull();
  });
});

describe('RenderVariableFields — text geometry', () => {
  test('normalizes the reflected Spanish title to English', () => {
    renderFields([variable({ key: 'titulo', label: 'Titulo' })]);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.queryByText('Titulo')).toBeNull();
  });

  test('carries a handle AND keeps the inline field as the fallback', () => {
    renderFields([variable()], { values: { headline: 'Typed here' } });

    expect(handleFor('headline')).toBeTruthy();
    expect(screen.getByDisplayValue('Typed here')).toBeTruthy();
  });

  test('says the wire wins so the typed value is not silently ignored', () => {
    renderFields([variable()], {
      values: { headline: 'Typed here' },
      connectedKeys: new Set(['headline']),
    });

    expect(screen.getByText(/the wired text is used instead of this field/)).toBeTruthy();
  });

  test('says nothing about a wire when there is none', () => {
    renderFields([variable()], { values: { headline: 'Typed here' } });
    expect(screen.queryByText(/the wired text is used/)).toBeNull();
  });
});

describe('RenderVariableFields — media and reserved geometry', () => {
  test('a media variable is wire-only', () => {
    renderFields([variable({ key: 'hero_image', label: 'Hero', kind: 'image', required: true })]);

    expect(handleFor('hero_image')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('the reserved brand logo stays locked: no control and no handle', () => {
    renderFields([
      variable({
        key: 'watermark_logo',
        label: 'Watermark Logo',
        kind: 'image',
        required: true,
        reserved: true,
      }),
    ]);

    expect(screen.getByText('Brand logo')).toBeTruthy();
    expect(handleFor('watermark_logo')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

// A media slot fills two ways. Both have to be reachable from the node, and the slot has
// to say which one is winning — a picked asset silently overridden by a wire is the kind
// of quiet disagreement that makes a render look like it ignored the user.
describe('RenderVariableFields — a media slot fills by wire OR by pick', () => {
  const hero = variable({ key: 'hero_image', label: 'Hero image', kind: 'image' });
  const pin = { assetId: 'asset-1', versionId: 'version-1' };

  test('offers the Library as well as the handle, in every state', () => {
    renderFields([hero], { brandId: 'brand-1' });

    expect(handleFor('hero_image')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Choose from Library/ })).toBeTruthy();
    expect(screen.getByText('Connect media or choose')).toBeTruthy();
  });

  test('a picked asset reads as filled, and can be taken back off', () => {
    const cleared: string[] = [];
    renderFields([hero], {
      brandId: 'brand-1',
      values: { hero_image: pin },
      mediaStatus: new Map([['hero_image', { connected: 0, ready: 0, picked: 1 }]]),
      onClear: (key) => cleared.push(key),
    });

    expect(screen.getByText('1 from Library')).toBeTruthy();
    // The handle stays: picking must never take wiring away.
    expect(handleFor('hero_image')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear Hero image' }));
    expect(cleared).toEqual(['hero_image']);
  });

  test('a wire over a pick says so rather than silently winning', () => {
    renderFields([hero], {
      brandId: 'brand-1',
      values: { hero_image: pin },
      mediaStatus: new Map([['hero_image', { connected: 1, ready: 1, picked: 1 }]]),
    });

    expect(screen.getByText('1 ready')).toBeTruthy();
    expect(
      screen.getByText('Connected — the wired media is used instead of this selection.'),
    ).toBeTruthy();
  });

  test('several wires on a scalar slot still announce the fan-out', () => {
    renderFields([hero], {
      brandId: 'brand-1',
      mediaStatus: new Map([['hero_image', { connected: 3, ready: 3, picked: 0 }]]),
    });

    expect(screen.getByText('3 ready · variations')).toBeTruthy();
  });

  test('without a brand the slot is wire-only, never a dead picker', () => {
    renderFields([hero], { brandId: null });

    expect(handleFor('hero_image')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Choose from Library/ })).toBeNull();
  });
});
