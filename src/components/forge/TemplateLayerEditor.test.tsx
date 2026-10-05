import { afterEach, expect, test } from 'bun:test';
import type { TemplateEditableLayer, TemplateLayerEdit } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { LayerControls } from './TemplateLayerEditor';

afterEach(cleanup);
const layer: TemplateEditableLayer = {
  compId: 7,
  comp: 'Square',
  layerId: 1,
  name: 'Text',
  kind: 'text',
  text: 'Client text',
  font: 'ClientFont-Regular',
  fontSize: 20,
  visible: true,
  visibilitySlotKeys: [],
  slotKeys: [],
  textReason: null,
  visibilityReason: null,
  geometryReason: null,
  x: 4,
  y: 5,
  width: null,
  height: null,
};
function Controls({ reason = null }: { reason?: string | null }) {
  const [edit, setEdit] = useState<TemplateLayerEdit>({ compId: 7, layerId: 1 });
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<string[]>([]);
  return (
    <>
      <LayerControls
        layer={{ ...layer, geometryReason: reason }}
        edit={edit}
        fonts={[]}
        disabled={false}
        inputValues={inputs}
        invalidFields={invalid}
        onInputValue={(field, value) => setInputs((current) => ({ ...current, [field]: value }))}
        onValidity={setInvalid}
        onEdit={(change) => setEdit((current) => ({ ...current, ...change }))}
      />
      <button type="button" disabled={invalid.length > 0}>
        Save
      </button>
      <output>{JSON.stringify(edit)}</output>
    </>
  );
}
test('point text permits position edits while unsupported resize stays disabled', () => {
  render(<Controls />);
  expect(screen.getByLabelText('x').hasAttribute('disabled')).toBe(false);
  expect(screen.getByLabelText('width').hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('x'), { target: { value: '17' } });
  expect(screen.getByRole('status').textContent).toContain('"x":17');
});
test('blank geometry remains invalid when another field changes', () => {
  render(<Controls />);
  fireEvent.change(screen.getByLabelText('x'), { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Text size (pt)'), { target: { value: '24' } });
  expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  expect((screen.getByLabelText('x') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('x'), { target: { value: '0' } });
  expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(false);
});
test('native unsafe geometry reason disables position controls', () => {
  render(<Controls reason="Animated position cannot be changed safely." />);
  expect(screen.getByLabelText('x').hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('y').hasAttribute('disabled')).toBe(true);
});
