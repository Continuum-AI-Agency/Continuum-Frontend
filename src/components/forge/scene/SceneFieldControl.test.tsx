/**
 * One Blender field's control: a field becomes a neutral Forge variable for the shared value
 * control, what that control hands back becomes a scene value (an emptied headline stays empty,
 * a cleared picture resets), and numbers and vectors scrub — clamped where the renderer refuses.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { type BlendField, blendParseSchema } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import parseExample from '../../../../packages/contracts/src/media/__fixtures__/blend-parse.example.json';
import { SceneFieldControl, sceneValueFromControl, sceneVariable } from './SceneFieldControl';

afterEach(cleanup);

const BRAND = '22222222-2222-4222-8222-222222222222';
const fields = blendParseSchema.parse(parseExample).fields;
const field = (key: string) => fields.find((candidate) => candidate.key === key) as BlendField;

describe('sceneVariable', () => {
  test('carries the kind and label and nothing After Effects-specific', () => {
    expect(sceneVariable(field('headline'), 'Title text')).toEqual({
      key: 'headline',
      label: 'Title text',
      kind: 'text',
      required: false,
      multiple: false,
      accept: [],
      options: [],
      description: null,
      reserved: false,
      role: null,
      roleSource: null,
      charBudget: null,
      comps: [],
      sample: null,
      placement: null,
      clip: null,
      exposed: true,
    });
  });
});

describe('sceneValueFromControl', () => {
  test('an emptied text box is an empty string, not a reset', () => {
    expect(sceneValueFromControl('text', null)).toBe('');
    expect(sceneValueFromControl('text', 'Sale')).toBe('Sale');
  });

  test('a cleared colour or picture resets; a pin and a boolean pass through', () => {
    expect(sceneValueFromControl('color', null)).toBeNull();
    expect(sceneValueFromControl('color', '#ff0000')).toBe('#ff0000');
    expect(sceneValueFromControl('image', null)).toBeNull();
    const pin = { assetId: 'a', versionId: 'v' };
    expect(sceneValueFromControl('image', pin)).toEqual(pin);
    expect(sceneValueFromControl('boolean', true)).toBe(true);
  });
});

describe('SceneFieldControl', () => {
  test('text edits through the shared value control', () => {
    const onChange = mock((_next: unknown) => {});
    render(
      <SceneFieldControl
        brandId={BRAND}
        field={field('headline')}
        label="Title text"
        value="Summer Sale"
        onChange={onChange}
      />,
    );
    const box = screen.getByRole('textbox', { name: 'Title text default' }) as HTMLInputElement;
    expect(box.value).toBe('Summer Sale');
    fireEvent.change(box, { target: { value: 'Black Friday' } });
    expect(onChange).toHaveBeenLastCalledWith('Black Friday');
    fireEvent.change(box, { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  test('a boolean is a switch', () => {
    const onChange = mock((_next: unknown) => {});
    render(
      <SceneFieldControl
        brandId={BRAND}
        field={field('hide_badge')}
        label="Badge hide in render"
        value={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Badge hide in render default' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  test('a vector is three axes', () => {
    const onChange = mock((_next: unknown) => {});
    render(
      <SceneFieldControl
        brandId={BRAND}
        field={field('swatch.location')}
        label="Swatch location"
        value={[-5, 0, -2]}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Swatch location X'), { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith([0, 0, -2]);
  });

  test('an ortho scale never goes to zero or below', () => {
    const onChange = mock((_next: unknown) => {});
    render(
      <SceneFieldControl
        brandId={BRAND}
        field={field('camwide.ortho_scale')}
        label="CamWide ortho scale"
        value={16}
        onChange={onChange}
      />,
    );
    const box = screen.getByLabelText('CamWide ortho scale');
    fireEvent.change(box, { target: { value: '8' } });
    expect(onChange).toHaveBeenLastCalledWith(8);
    fireEvent.change(box, { target: { value: '-3' } });
    fireEvent.blur(box);
    const sent = onChange.mock.calls.map(([value]) => value as number);
    expect(sent.every((value) => value > 0)).toBe(true);
  });
});
