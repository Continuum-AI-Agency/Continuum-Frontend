import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { TemplateEditableLayer } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { previewTarget, TemplateLayerPreview } from './TemplateLayerPreview';

const layer: TemplateEditableLayer = {
  compId: 1,
  comp: 'Main',
  layerId: 1,
  name: 'Artwork',
  kind: 'artwork',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: null,
  font: null,
  fontSize: null,
  slotKeys: [],
  visibilitySlotKeys: [],
  index: 0,
  position: [100, 200],
  rotation: 0,
  scale: [100, 100],
  opacity: 100,
  transformLocks: {},
  parentName: null,
  parentId: null,
};
const markup =
  '<svg viewBox="0 0 400 300"><g data-layer-id="1"><rect width="30" height="40"/></g><g data-layer-id="2" data-in="1"><path d="M0 0h10"/></g></svg>';
afterEach(cleanup);

describe('template preview interactions', () => {
  test('selects the containing composition when its flattened artwork is clicked', () => {
    const container = document.createElement('div');
    container.innerHTML = markup;
    const child = { ...layer, compId: 2, layerId: 2 };
    expect(previewTarget(container.querySelector('path')!, [layer, child], 1)).toEqual(layer);
    expect(previewTarget(container.querySelector('svg')!, [layer, child], 1)).toBeNull();
  });

  test('arrow keys move the selected layer; modified keys and locked positions cannot write', () => {
    const onEdit = mock(() => {});
    const props = {
      markup,
      compId: 1,
      layers: [layer],
      layer,
      fonts: [],
      disabled: false,
      onSelect: mock(() => {}),
      onEdit,
    };
    const { rerender } = render(<TemplateLayerPreview {...props} />);
    const canvas = screen.getByRole('application', { name: 'Interactive template preview' });
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(onEdit).toHaveBeenLastCalledWith(layer, { position: [101, 200] });
    fireEvent.keyDown(canvas, { key: 'ArrowDown', shiftKey: true });
    expect(onEdit).toHaveBeenLastCalledWith(layer, { position: [100, 210] });
    fireEvent.keyDown(canvas, { key: 'ArrowUp', ctrlKey: true });
    rerender(
      <TemplateLayerPreview
        {...props}
        layer={{ ...layer, transformLocks: { position: 'Animated position' } }}
      />,
    );
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  test('right click opens canonical controls without committing an edit', async () => {
    const onEdit = mock(() => {});
    const onSelect = mock(() => {});
    const { container } = render(
      <TemplateLayerPreview
        markup={markup}
        layers={[layer]}
        compId={1}
        layer={layer}
        fonts={[]}
        disabled={false}
        onSelect={onSelect}
        onEdit={onEdit}
      />,
    );
    fireEvent.contextMenu(container.querySelector('rect')!);
    expect(onSelect).toHaveBeenCalledWith(1);
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Layer controls' })).toBeTruthy(),
    );
    expect(screen.getByLabelText('Position X')).toBeTruthy();
    expect(onEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Close layer controls' }));
    expect(screen.getByRole('dialog', { name: 'Layer controls' }).hasAttribute('data-closed')).toBe(true);
  });
});
