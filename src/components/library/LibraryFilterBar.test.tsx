import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import { LibraryFilterBar } from './LibraryFilterBar';

afterEach(() => cleanup());

describe('LibraryFilterBar', () => {
  it('labels source and format filters on embedded surfaces', () => {
    render(
      <LibraryFilterBar
        source="all"
        kind="all"
        onSourceChange={() => {}}
        onKindChange={() => {}}
        variant="compact"
      />,
    );

    expect(screen.getByRole('group', { name: 'Filter by source' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Filter by format' })).toBeDefined();
  });

  it('can omit the redundant source row on the full Library page', () => {
    render(
      <LibraryFilterBar
        source="all"
        kind="all"
        onSourceChange={() => {}}
        onKindChange={() => {}}
        showSource={false}
      />,
    );

    expect(screen.queryByRole('group', { name: 'Filter by source' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Filter by format' })).toBeDefined();
  });

  it('collapses page taxonomy and tags into one searchable filter control', () => {
    render(
      <LibraryFilterBar
        source="all"
        kind="all"
        onSourceChange={() => {}}
        onKindChange={() => {}}
        mediaType="all"
        onMediaTypeChange={() => {}}
        createdWith={[]}
        onCreatedWithChange={() => {}}
        tagOptions={[
          { tag: 'launch', count: 12 },
          { tag: 'winning', count: 7 },
        ]}
        selectedTags={['launch']}
        onTagsChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Filter 1' })).toBeDefined();
    expect(screen.getByText('launch')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Filter by format' })).toBeNull();
  });
});
