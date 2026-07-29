import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import type { OrganicPlatformAccounts } from '@/lib/organic/platformAccountOptions';
import { PlannerTargetPicker } from './PlannerTargetPicker';
import { chooseOption, installPickerDomGlobals, openSelect, stubSource } from './pickerTestHarness';

installPickerDomGlobals();
afterEach(cleanup);

const BRAND_ID = '11111111-1111-4111-8111-111111111111';

const platformAccounts: OrganicPlatformAccounts[] = [
  {
    platform: 'instagram',
    label: 'Instagram',
    connected: true,
    accountId: 'ig-main',
    options: [
      { id: 'ig-main', label: 'Main profile' },
      { id: 'ig-second', label: 'Second profile' },
    ],
  },
  {
    platform: 'linkedin',
    label: 'LinkedIn',
    connected: true,
    accountId: 'li-page',
    options: [{ id: 'li-page', label: 'Company page' }],
  },
];

describe('PlannerTargetPicker', () => {
  test('keeps unsupported platforms visible but disabled with the reason', () => {
    render(
      <PlannerTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'ig-main' }}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: platformAccounts })}
      />,
    );

    openSelect('Planner platform');
    expect(screen.getByRole('option', { name: 'Instagram' })).toBeTruthy();
    const tiktok = screen.getByRole('option', { name: /TikTok — not supported yet/ });
    expect(tiktok.getAttribute('data-disabled')).not.toBeNull();
  });

  test('writes the account for the selected platform', () => {
    const onChange = mock();
    render(
      <PlannerTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'ig-main' }}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: platformAccounts })}
      />,
    );

    openSelect('Connected account');
    chooseOption('Second profile');
    expect(onChange).toHaveBeenLastCalledWith({ platform: 'instagram', accountId: 'ig-second' });
  });

  test('drops an account that no longer addresses anything when the platform changes', () => {
    const onChange = mock();
    render(
      <PlannerTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'ig-main' }}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ items: platformAccounts })}
      />,
    );

    openSelect('Planner platform');
    chooseOption('LinkedIn');
    expect(onChange).toHaveBeenLastCalledWith({ platform: 'linkedin', accountId: null });
  });

  test('renders the catalog placeholder id as unset, not as text to overwrite', () => {
    render(
      <PlannerTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'select-connected-account' }}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: platformAccounts })}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Connected account' }).textContent).toContain(
      'Select an account',
    );
    expect(
      screen.getByText('This step cannot run or publish until an account is chosen.'),
    ).toBeTruthy();
  });

  test('degrades to the raw account id when the source errors, keeping the platform editable', () => {
    const onChange = mock();
    render(
      <PlannerTargetPicker
        brandId={BRAND_ID}
        value={{ platform: 'instagram', accountId: 'ig-main' }}
        disabled={false}
        onChange={onChange}
        useSource={stubSource({ isError: true })}
      />,
    );

    const field = screen.getByLabelText('Connected account ID') as HTMLInputElement;
    expect(field.value).toBe('ig-main');
    expect(screen.getByRole('combobox', { name: 'Planner platform' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Connected account' })).toBeNull();
  });

  test('shows an empty raw field for the placeholder id while degraded', () => {
    render(
      <PlannerTargetPicker
        value={{ platform: 'instagram', accountId: 'select-connected-account' }}
        disabled={false}
        onChange={mock()}
        useSource={stubSource({ items: platformAccounts })}
      />,
    );

    expect((screen.getByLabelText('Connected account ID') as HTMLInputElement).value).toBe('');
  });
});
