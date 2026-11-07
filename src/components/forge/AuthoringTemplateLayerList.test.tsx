import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { TemplateLayerList } from './AuthoringTemplateLayerList';

describe('TemplateLayerList', () => {
  test('selects and reorders authored UUID identities alongside existing numeric source IDs', () => {
    const onSelect = mock(() => {});
    const onReorder = mock(() => {});
    render(
      <TemplateLayerList
        label="Layers"
        rows={[
          { id: 71, label: 'Source title', kind: 'text' },
          { id: 'draft:10000000-0000-4000-8000-000000000001', label: 'New title', kind: 'text' },
        ]}
        selectedId="draft:10000000-0000-4000-8000-000000000001"
        onSelect={onSelect}
        onReorder={onReorder}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New title' }));
    expect(onSelect).toHaveBeenCalledWith('draft:10000000-0000-4000-8000-000000000001');
    fireEvent.click(screen.getByRole('button', { name: 'Bring New title forward' }));
    expect(onReorder).toHaveBeenCalledWith([
      'draft:10000000-0000-4000-8000-000000000001',
      71,
    ], { tool: 'Forge layer list', button: 'Bring layer forward' });
  });

  test('records stable show/hide button actions and keeps target identity separate', () => {
    const onToggleVisible = mock(() => {});
    const longName = 'L'.repeat(500);
    render(<TemplateLayerList label="Visibility" rows={[
      { id: 'aep:1:11', label: 'Hidden title', kind: 'text', hidden: true },
      { id: 'aep:1:12', label: 'Shown box', kind: 'shape' },
      { id: 'aep:1:13', label: longName, kind: 'shape' },
    ]} onToggleVisible={onToggleVisible} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show Hidden title' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide Shown box' }));
    fireEvent.click(screen.getByRole('button', { name: `Hide ${longName}` }));
    expect(onToggleVisible.mock.calls).toEqual([
      ['aep:1:11', { tool: 'Forge layer list', button: 'Show layer' }],
      ['aep:1:12', { tool: 'Forge layer list', button: 'Hide layer' }],
      ['aep:1:13', { tool: 'Forge layer list', button: 'Hide layer' }],
    ]);
  });

  test('offers group membership only for explicitly eligible rows', () => {
    const onToggleGroupSelection = mock(() => {});
    render(
      <TemplateLayerList
        label="Layers"
        rows={[
          { id: 'aep:1:11', label: 'Eligible title', kind: 'text', groupable: true },
          { id: 'aep:1:12', label: 'Locked box', kind: 'shape' },
        ]}
        groupSelectionIds={[]}
        onToggleGroupSelection={onToggleGroupSelection}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include Eligible title in group' }));
    expect(onToggleGroupSelection).toHaveBeenCalledWith('aep:1:11');
    expect(screen.queryByRole('checkbox', { name: 'Include Locked box in group' })).toBeNull();
  });
});
