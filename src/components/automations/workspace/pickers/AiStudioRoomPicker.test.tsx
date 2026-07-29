import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { AiStudioRoomPicker } from './AiStudioRoomPicker';
import type { CanvasRoomOption } from './defaultPickerSources';
import { chooseOption, installPickerDomGlobals, openSelect, stubSource } from './pickerTestHarness';

installPickerDomGlobals();
afterEach(cleanup);

const BRAND_ID = '11111111-1111-4111-8111-111111111111';

const rooms: CanvasRoomOption[] = [
  { id: 'room-main', name: 'Main Workspace' },
  { id: 'room-ads', name: 'Ad concepts' },
];

describe('AiStudioRoomPicker', () => {
  test('offers the brand workspaces plus an explicit no-workspace option', () => {
    render(
      <AiStudioRoomPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: rooms })}
      />,
    );

    openSelect('AI Studio workspace');
    expect(screen.getByRole('option', { name: 'No workspace' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Main Workspace' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Ad concepts' })).toBeTruthy();
  });

  test('writes the room id, and null for no workspace', () => {
    const onChange = mock();
    const { rerender } = render(
      <AiStudioRoomPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: rooms })}
      />,
    );

    openSelect('AI Studio workspace');
    chooseOption('Ad concepts');
    expect(onChange).toHaveBeenLastCalledWith('room-ads');

    rerender(
      <AiStudioRoomPicker
        brandId={BRAND_ID}
        value="room-ads"
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: rooms })}
      />,
    );
    openSelect('AI Studio workspace');
    chooseOption('No workspace');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('renders an unset room as no workspace, not as text to overwrite', () => {
    render(
      <AiStudioRoomPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: rooms })}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'AI Studio workspace' }).textContent).toContain(
      'No workspace',
    );
    expect(screen.queryByLabelText('AI Studio workspace ID')).toBeNull();
  });

  test('degrades to the raw workspace id when the source errors', () => {
    render(
      <AiStudioRoomPicker
        brandId={BRAND_ID}
        value="room-main"
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ isError: true })}
      />,
    );

    expect((screen.getByLabelText('AI Studio workspace ID') as HTMLInputElement).value).toBe(
      'room-main',
    );
  });
});
