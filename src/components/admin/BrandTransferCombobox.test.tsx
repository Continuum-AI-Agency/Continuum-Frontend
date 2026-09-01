import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AdminBrandOption } from '@/components/admin/adminUserTypes';
import { BrandTransferCombobox } from './BrandTransferCombobox';

Object.assign(globalThis, {
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
});

// The two brands the admin reports name by hand (#276 / #278), plus a decoy that must
// disappear when the search narrows. The owner email on the VIVO row deliberately shares
// no characters with the search terms, so a match there can only have come from the
// brand's own name -- an email containing "vivo47" would make #278 pass for free.
const VIVO: AdminBrandOption = {
  id: 'd666c706-8ffd-4ade-a1b1-cb9f71b25831',
  brand_name: 'VIVO 47 Center',
  tier: 1,
  active: true,
  ownerEmail: 'admin@grupo-comercial.example.com',
};

const EVIE: AdminBrandOption = {
  id: '11111111-2222-4333-8444-555555555555',
  brand_name: "eviechamps123's Brand",
  tier: 1,
  active: true,
  ownerEmail: 'eviechamps123@extremely-long-provider.example.com',
};

const NO_OWNER: AdminBrandOption = {
  id: '99999999-8888-4777-8666-555555555555',
  brand_name: 'Global workflow library',
  tier: 1,
  active: true,
  ownerEmail: null,
};

const BRANDS = [VIVO, EVIE, NO_OWNER];

function openPicker(value = '') {
  render(
    <BrandTransferCombobox
      brands={BRANDS}
      value={value}
      onChange={() => {}}
      placeholder="Choose destination brand"
    />,
  );
  if (!value) fireEvent.click(screen.getByRole('combobox'));
  return screen.getByPlaceholderText('Search brands, owners, or ids…') as HTMLInputElement;
}

function search(input: HTMLInputElement, query: string) {
  fireEvent.change(input, { target: { value: query } });
}

describe('BrandTransferCombobox rows (#276)', () => {
  afterEach(cleanup);

  it('shows each brand name and its FULL owner email, on separate lines', () => {
    openPicker();

    for (const brand of [VIVO, EVIE]) {
      expect(screen.getByText(brand.brand_name)).toBeTruthy();
      // Not `toContain` on a joined label: the email must be its own complete text node,
      // which is what an ellipsis in the middle of it would break.
      const detail = screen.getByText(`${brand.ownerEmail} — …${brand.id.slice(-8)}`);
      expect(detail.textContent).toContain(brand.ownerEmail as string);
    }
  });

  it('leaves no row text clipped by `truncate`', () => {
    openPicker();

    const rows = screen.getAllByTestId('brand-picker-option');
    expect(rows).toHaveLength(BRANDS.length);
    for (const row of rows) {
      expect(row.querySelectorAll('.truncate')).toHaveLength(0);
      expect(row.className).not.toContain('truncate');
    }
  });

  it('renders the selected brand on the trigger un-truncated', () => {
    render(
      <BrandTransferCombobox
        brands={BRANDS}
        value={EVIE.id}
        onChange={() => {}}
        placeholder="Choose destination brand"
      />,
    );

    const label = screen.getByTestId('brand-picker-trigger-label');
    expect(label.className).not.toContain('truncate');
    expect(label.querySelectorAll('.truncate')).toHaveLength(0);
    expect(label.textContent).toContain(EVIE.brand_name);
    expect(label.textContent).toContain(EVIE.ownerEmail as string);
  });

  it('falls back to the id suffix when a brand has no owner', () => {
    openPicker();
    expect(screen.getByText(`…${NO_OWNER.id.slice(-8)}`)).toBeTruthy();
  });
});

// #278 was filed as "search fails on the brand's real name" and blamed on a missing query
// normaliser. There is no normaliser: cmdk's own command-score is the matcher. These run the
// reported queries through the REAL component and the REAL matcher rather than scoring a
// string in isolation -- if any of them ever regresses, it fails here before a user sees it.
describe('BrandTransferCombobox search (#278)', () => {
  afterEach(cleanup);

  it.each([
    'VIVO 47 center',
    'vivo47',
    'Vivo 47',
    '47 center',
  ])('finds "VIVO 47 Center" for %p', (query) => {
    const input = openPicker();
    search(input, query);

    expect(screen.getByText(VIVO.brand_name)).toBeTruthy();
    expect(screen.queryByText('No brands found.')).toBeNull();
  });

  it('narrows to the matching brand instead of listing everything', () => {
    const input = openPicker();
    search(input, 'VIVO 47 center');

    expect(screen.getByText(VIVO.brand_name)).toBeTruthy();
    expect(screen.queryByText(EVIE.brand_name)).toBeNull();
    expect(screen.queryByText(NO_OWNER.brand_name)).toBeNull();
  });

  it('matches on the owner email too', () => {
    const input = openPicker();
    search(input, 'eviechamps123@');

    expect(screen.getByText(EVIE.brand_name)).toBeTruthy();
    expect(screen.queryByText(VIVO.brand_name)).toBeNull();
  });

  it('reports an empty list only when nothing matches', () => {
    const input = openPicker();
    search(input, 'zzzz-no-such-brand');

    expect(screen.queryByTestId('brand-picker-option')).toBeNull();
    expect(screen.getByText('No brands found.')).toBeTruthy();
  });
});
