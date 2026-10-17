import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { TemplateAuthoringNode } from '@continuum/contracts';
import { TemplateLayerAuthoredMasks } from './TemplateLayerAuthoredMasks';

const mask = {
  draftMaskId: '20000000-0000-4000-8000-000000000001',
  name: 'Inset', shape: 'rectangle', center: [-8, 0], size: [20, 14],
  mode: 'subtract', opacity: 82, feather: [1, 2],
} as const;
const geometry = {
  status: 'verified', coordinateSpace: 'layer-source-pixels', sourceKind: 'shape-path',
  sourceRef: { kind: 'native-path', id: 4, name: 'Path' },
  bounds: { x: -20, y: -10, width: 40, height: 20 }, anchor: [0, 0, 0],
  position: [10, 20, 0], scale: [100, 100, 100], rotation: 0,
  localToComp: { matrix: [1, 0, 0, 1, 10, 20], corners: [[-20, -10], [20, -10], [20, 10], [-20, 10]], verifiedWithPyAep: true },
  measurement: 'test', packageSha256: 'a'.repeat(64), sourceAepSha256: 'b'.repeat(64), compId: 11, layerUid: 9,
} as const;

describe('TemplateLayerAuthoredMasks', () => {
  afterEach(() => cleanup());

  test('keeps edit and delete unavailable before native save/reopen proof', () => {
    render(<TemplateLayerAuthoredMasks
      nodeId="aep:11:9"
      masks={[mask] as unknown as TemplateAuthoringNode['masks']}
      authoredMaskIds={new Set([mask.draftMaskId])}
      geometry={geometry as unknown as Extract<TemplateAuthoringNode['maskSourceGeometry'], { status: 'verified' }>}
      disabled={false}
      mutationsAvailable={false}
    />);

    expect(screen.getByText('Inset')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Inset' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete Inset' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Editing and removal are unavailable until native save and reopen checks pass.')).toBeTruthy();
  });

  test('updates only the selected authored mask identity and retains signed source coordinates', () => {
    const onUpdate = mock((_nodeId: string, _id: string, _patch: Record<string, unknown>) => {});
    const onDelete = mock((_nodeId: string, _id: string) => {});
    render(<TemplateLayerAuthoredMasks
      nodeId="aep:11:9"
      masks={[mask] as unknown as TemplateAuthoringNode['masks']}
      authoredMaskIds={new Set([mask.draftMaskId])}
      geometry={geometry as unknown as Extract<TemplateAuthoringNode['maskSourceGeometry'], { status: 'verified' }>}
      disabled={false}
      mutationsAvailable
      onUpdate={onUpdate}
      onDelete={onDelete}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Inset' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name for Inset' }), { target: { value: 'Signed inset' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Inset center X' }), { target: { value: '-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Inset' }));

    expect(onUpdate).toHaveBeenCalledWith('aep:11:9', mask.draftMaskId, expect.objectContaining({ name: 'Signed inset', center: [-10, 0] }));
    expect(onUpdate.mock.calls[0]?.[2]).not.toHaveProperty('shape');
    expect(onDelete).not.toHaveBeenCalled();
  });

  test('deletes only the selected draft mask with its source node identity', () => {
    const onDelete = mock((_nodeId: string, _id: string) => {});
    render(<TemplateLayerAuthoredMasks
      nodeId="aep:11:9"
      masks={[mask] as unknown as TemplateAuthoringNode['masks']}
      authoredMaskIds={new Set([mask.draftMaskId])}
      geometry={geometry as unknown as Extract<TemplateAuthoringNode['maskSourceGeometry'], { status: 'verified' }>}
      disabled={false}
      mutationsAvailable
      onUpdate={() => {}}
      onDelete={onDelete}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Inset' }));
    expect(onDelete).toHaveBeenCalledWith('aep:11:9', mask.draftMaskId);
  });

  test('filters native/imported masks out by their absent authored command identity', () => {
    const imported = { ...mask, draftMaskId: '20000000-0000-4000-8000-000000000002', name: 'Imported mask' };
    render(<TemplateLayerAuthoredMasks
      nodeId="aep:11:9"
      masks={[mask, imported] as unknown as TemplateAuthoringNode['masks']}
      authoredMaskIds={new Set([mask.draftMaskId])}
      geometry={geometry as unknown as Extract<TemplateAuthoringNode['maskSourceGeometry'], { status: 'verified' }>}
      disabled={false}
      mutationsAvailable
      onUpdate={() => {}}
      onDelete={() => {}}
    />);

    expect(screen.getByText('Inset')).toBeTruthy();
    expect(screen.queryByText('Imported mask')).toBeNull();
  });
});
