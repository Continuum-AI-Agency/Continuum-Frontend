import { describe, expect, mock, test } from 'bun:test';
import { fireEvent, render, screen } from '@testing-library/react';
import { TemplateLayerList } from './TemplateLayerList';

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
