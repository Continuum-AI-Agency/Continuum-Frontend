import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { OrganicPublishAccountOption } from '@/lib/organic/platformAccountOptions';
import { OrganicPublishTargetPicker } from './OrganicPublishTargetPicker';
import { installPickerDomGlobals, stubSource } from './pickerTestHarness';

installPickerDomGlobals();
afterEach(cleanup);

const BRAND_ID = '11111111-1111-4111-8111-111111111111';

const accounts: OrganicPublishAccountOption[] = [
  {
    platform: 'instagram',
    platformLabel: 'Instagram',
    accountId: 'ig-main',
    label: 'Main profile',
  },
  { platform: 'linkedin', platformLabel: 'LinkedIn', accountId: 'li-page', label: 'Company page' },
];

function openTarget() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Publish target' }));
}

describe('OrganicPublishTargetPicker', () => {
  test('lists every connected account grouped by its platform', () => {
    render(
      <OrganicPublishTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'ig-main' }}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: accounts })}
      />,
    );

    openTarget();
    expect(screen.getByText('Instagram')).toBeTruthy();
    expect(screen.getByText('LinkedIn')).toBeTruthy();
    expect(screen.getByText('Main profile')).toBeTruthy();
    expect(screen.getByText('Company page')).toBeTruthy();
  });

  test('sets platform and accountId TOGETHER so the pair can never disagree', () => {
    const onChange = mock();
    render(
      <OrganicPublishTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'ig-main' }}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: accounts })}
      />,
    );

    openTarget();
    fireEvent.click(screen.getByText('Company page'));

    // The stored platform was instagram; picking a LinkedIn account moves both.
    expect(onChange).toHaveBeenLastCalledWith({ platform: 'linkedin', accountId: 'li-page' });
  });

  test('renders the catalog placeholder id as unset', () => {
    render(
      <OrganicPublishTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'select-connected-account' }}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: accounts })}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Publish target' }).textContent).toContain(
      'Select a connected account',
    );
  });

  test('degrades to platform + raw account id when the source errors', () => {
    const onChange = mock();
    render(
      <OrganicPublishTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'linkedin', accountId: 'li-page' }}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ isError: true })}
      />,
    );

    expect(screen.queryByRole('combobox', { name: 'Publish target' })).toBeNull();
    const field = screen.getByLabelText('Connected account ID') as HTMLInputElement;
    expect(field.value).toBe('li-page');

    fireEvent.change(field, { target: { value: 'li-other' } });
    expect(onChange).toHaveBeenLastCalledWith({ platform: 'linkedin', accountId: 'li-other' });
  });

  test('shows an empty raw field for the placeholder id while degraded', () => {
    render(
      <OrganicPublishTargetPicker
        value={{ platform: 'instagram', accountId: 'select-connected-account' }}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: accounts })}
      />,
    );

    expect((screen.getByLabelText('Connected account ID') as HTMLInputElement).value).toBe('');
  });
});
