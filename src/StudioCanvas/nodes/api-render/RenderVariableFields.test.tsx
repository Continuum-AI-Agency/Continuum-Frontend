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
  test('offers exactly the options the template reflected, and no others', () => {
    const options = ['top_left', 'top_right', 'bottom_left', 'bottom_right'];
    renderFields([
      variable({ key: 'watermark_position', label: 'Watermark Position', kind: 'enum', options }),
    ]);

    const picker = screen.getByRole('combobox') as HTMLSelectElement;
    // One placeholder for a variable that is not required, plus the reflected set.
    expect([...picker.options].map((option) => option.value)).toEqual(['', ...options]);
  });

  // A `<select>` with no empty option paints option one as selected while '' is what is
  // actually stored. The field then reads "a" while the stored value remains missing — the
  // control and the renderer disagreeing about the same variable. The placeholder stays so
  // an unanswered required enum LOOKS unanswered.
  test('a required enum shows an empty choose-state instead of selecting option one', () => {
    renderFields([
      variable({ key: 'position', kind: 'enum', required: true, options: ['a', 'b'] }),
    ]);

    const picker = screen.getByRole('combobox') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.value)).toEqual(['', 'a', 'b']);
    expect(picker.value).toBe('');
    expect(picker.selectedIndex).toBe(0);
    // Disabled, so the placeholder cannot be chosen back as if it were an answer — it is
    // a prompt, not a value the renderer accepts.
    expect(picker.options[0]?.disabled).toBe(true);
    expect(picker.options[0]?.text).toBe('Choose…');
  });

  test('a required enum shows the stored value once one is chosen', () => {
    renderFields(
      [variable({ key: 'position', kind: 'enum', required: true, options: ['a', 'b'] })],
      { values: { position: 'b' } },
    );

    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('b');
  });

  // The other direction: clearing an optional variable is a real thing to want, so its
  // placeholder stays reachable.
  test('an optional enum keeps its placeholder selectable', () => {
    renderFields([variable({ key: 'position', kind: 'enum', options: ['a', 'b'] })]);

    const picker = screen.getByRole('combobox') as HTMLSelectElement;
    expect(picker.options[0]?.disabled).toBe(false);
    expect(picker.options[0]?.text).toBe('Not set…');
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
