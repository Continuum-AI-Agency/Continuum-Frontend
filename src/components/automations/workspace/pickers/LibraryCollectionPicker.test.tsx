import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { MediaCollection } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import { LibraryCollectionPicker } from './LibraryCollectionPicker';
import { chooseOption, installPickerDomGlobals, openSelect, stubSource } from './pickerTestHarness';

installPickerDomGlobals();
afterEach(cleanup);

const BRAND_ID = '11111111-1111-4111-8111-111111111111';

function collection(id: string, name: string): MediaCollection {
  return {
    id,
    brandId: BRAND_ID,
    name,
    kind: 'manual',
    smartQuery: null,
    coverAssetId: null,
    itemCount: 0,
    createdBy: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  } as MediaCollection;
}

const collections = [collection('col-brand', 'Brand assets'), collection('col-ugc', 'UGC')];

describe('LibraryCollectionPicker', () => {
  test('offers the flat collection list plus a library-root option', () => {
    render(
      <LibraryCollectionPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: collections })}
      />,
    );

    openSelect('Library collection');
    expect(screen.getByRole('option', { name: 'Library root' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Brand assets' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'UGC' })).toBeTruthy();
  });

  test('writes the chosen collection id, and null for the library root', () => {
    const onChange = mock();
    const { rerender } = render(
      <LibraryCollectionPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: collections })}
      />,
    );

    openSelect('Library collection');
    chooseOption('UGC');
    expect(onChange).toHaveBeenLastCalledWith('col-ugc');

    rerender(
      <LibraryCollectionPicker
        brandId={BRAND_ID}
        value="col-ugc"
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: collections })}
      />,
    );
    openSelect('Library collection');
    chooseOption('Library root');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  test('renders an unset target as the library root, not as text to overwrite', () => {
    render(
      <LibraryCollectionPicker
        brandId={BRAND_ID}
        value={null}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: collections })}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Library collection' }).textContent).toContain(
      'Library root',
    );
    expect(screen.queryByLabelText('Library collection ID')).toBeNull();
  });

  test('keeps a collection that no longer exists selectable rather than discarding it', () => {
    render(
      <LibraryCollectionPicker
        brandId={BRAND_ID}
        value="col-deleted"
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: collections })}
      />,
    );

    openSelect('Library collection');
    expect(
      screen.getByRole('option', { name: /Unavailable collection \(col-deleted\)/ }),
    ).toBeTruthy();
  });

  test('degrades to the raw collection id when the source errors', () => {
    const onChange = mock();
    render(
      <LibraryCollectionPicker
        brandId={BRAND_ID}
        value="col-brand"
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ isError: true })}
      />,
    );

    const field = screen.getByLabelText('Library collection ID') as HTMLInputElement;
    expect(field.value).toBe('col-brand');
    expect(screen.queryByRole('combobox', { name: 'Library collection' })).toBeNull();
  });

  test('degrades when no brand is in scope', () => {
    render(
      <LibraryCollectionPicker
        value="col-brand"
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: collections })}
      />,
    );

    expect((screen.getByLabelText('Library collection ID') as HTMLInputElement).value).toBe(
      'col-brand',
    );
  });
});
