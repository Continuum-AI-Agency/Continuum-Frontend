import { expect, mock, test } from 'bun:test';
import type { TemplatePreview } from '@continuum/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { TEXT_REPAIR_FONT_MIME, TemplateTextRepairCanvas } from './TemplateTextRepairCanvas';

test('drag distance is converted from preview pixels to the measured AEP comp', () => {
  const parse = {
    ratios: [{ ratio: '1:1', width: 1080, height: 1080, comps: ['Main'] }],
    slots: [
      {
        key: 'headline',
        name: 'Headline',
        kind: 'text',
        comps: ['Main'],
        instances: [
          {
            compId: 4,
            comp: 'Main',
            layerId: 12,
            box: [100, 100, 300, 200],
            compSize: [1080, 1080],
          },
        ],
      },
    ],
  } as TemplatePreview;
  const onMove = mock((_move: unknown) => undefined);
  render(
    <TemplateTextRepairCanvas parse={parse} ratio="1:1" comp="Main" moves={{}} onMove={onMove} />,
  );
  const svg = screen.getByTitle('Text placement in Main').parentElement as SVGSVGElement;
  svg.getBoundingClientRect = () => ({ width: 540, height: 540 }) as DOMRect;
  const box = screen.getByRole('button', { name: 'Move Headline' });
  fireEvent.pointerDown(box, { pointerId: 1, clientX: 100, clientY: 100 });
  fireEvent.pointerMove(box, { pointerId: 1, clientX: 110, clientY: 105 });
  fireEvent.pointerUp(box, { pointerId: 1 });
  expect(onMove).toHaveBeenLastCalledWith({ compId: 4, layerId: 12, dx: 20, dy: 10, dw: 0, dh: 0 });
  const handle = screen.getByRole('button', { name: 'Resize Headline' });
  fireEvent.pointerDown(handle, { pointerId: 2, clientX: 200, clientY: 200 });
  fireEvent.pointerMove(handle, { pointerId: 2, clientX: 215, clientY: 210 });
  fireEvent.pointerUp(handle, { pointerId: 2 });
  expect(onMove).toHaveBeenLastCalledWith({ compId: 4, layerId: 12, dx: 0, dy: 0, dw: 30, dh: 20 });
});

test('dropping an available font on a measured layer keeps its pending position and size', () => {
  const parse = {
    ratios: [{ ratio: '1:1', width: 1080, height: 1080, comps: ['Main'] }],
    slots: [
      {
        key: 'headline',
        name: 'Headline',
        kind: 'text',
        comps: ['Main'],
        instances: [
          {
            compId: 4,
            comp: 'Main',
            layerId: 12,
            box: [100, 100, 300, 200],
            compSize: [1080, 1080],
          },
        ],
      },
    ],
  } as TemplatePreview;
  const onMove = mock((_move: unknown) => undefined);
  render(
    <TemplateTextRepairCanvas
      parse={parse}
      ratio="1:1"
      comp="Main"
      moves={{ '4:12': { compId: 4, layerId: 12, dx: 15, dy: 10, dw: 20, dh: 5 } }}
      availableFonts={['Geneva']}
      onMove={onMove}
    />,
  );
  const box = screen.getByRole('button', { name: 'Move Headline' });
  const dataTransfer = {
    types: [TEXT_REPAIR_FONT_MIME],
    getData: () => 'Geneva',
    dropEffect: 'none',
  };
  fireEvent.dragOver(box, { dataTransfer });
  fireEvent.drop(box, { dataTransfer });
  expect(onMove).toHaveBeenCalledWith({
    compId: 4,
    layerId: 12,
    dx: 15,
    dy: 10,
    dw: 20,
    dh: 5,
    font: 'Geneva',
  });
  onMove.mockClear();
  fireEvent.drop(box, { dataTransfer: { ...dataTransfer, getData: () => 'Unknown' } });
  expect(onMove).not.toHaveBeenCalled();
});
