import { afterEach, describe, expect, mock, test } from 'bun:test';

mock.module('@/lib/library/useBrandRole', () => ({
  useBrandRole: () => 'owner',
  canEditLibrary: () => true,
}));

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@/components/library/__tests__/renderWithCreativeI18n';
import { BrandIdentityTagMenu } from './BrandIdentityTagMenu';

const BRAND = '22222222-2222-4222-8222-222222222222';
const ASSET = '33333333-3333-4333-8333-333333333333';

afterEach(cleanup);

async function open() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('brand-identity-tags'));
  });
}

describe('BrandIdentityTagMenu', () => {
  test('marking a variant also files the image as a logo', async () => {
    const update = mock(async () => undefined);
    const onTagsChange = mock((_tags: string[]) => undefined);
    render(
      <BrandIdentityTagMenu
        brandId={BRAND}
        assetId={ASSET}
        tags={[]}
        update={update}
        onTagsChange={onTagsChange}
      />,
    );
    await open();
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: /White/ }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        brandId: BRAND,
        assetId: ASSET,
        addTags: ['logo:white', 'logo'],
      }),
    );
    expect(onTagsChange).toHaveBeenCalledWith(['logo:white', 'logo']);
  });

  test('unchecking removes only that tag', async () => {
    const update = mock(async () => undefined);
    render(
      <BrandIdentityTagMenu
        brandId={BRAND}
        assetId={ASSET}
        tags={['reference', 'logo']}
        update={update}
      />,
    );
    await open();
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Brand reference' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        brandId: BRAND,
        assetId: ASSET,
        removeTags: ['reference'],
      }),
    );
  });

  test('onboarding logo tiles offer the variants only', async () => {
    render(
      <BrandIdentityTagMenu
        brandId={BRAND}
        assetId={ASSET}
        tags={['logo']}
        variantsOnly
        update={mock(async () => undefined)}
      />,
    );
    await open();
    expect(await screen.findByRole('menuitemcheckbox', { name: 'Horizontal' })).toBeTruthy();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'Brand reference' })).toBeNull();
  });

  test('a failed write puts the box back', async () => {
    const update = mock(async () => {
      throw new Error('offline');
    });
    render(<BrandIdentityTagMenu brandId={BRAND} assetId={ASSET} tags={[]} update={update} />);
    await open();
    const icon = await screen.findByRole('menuitemcheckbox', { name: 'Icon or mark' });
    fireEvent.click(icon);
    await waitFor(() => expect(update).toHaveBeenCalled());
    await waitFor(() => expect(icon.getAttribute('aria-checked')).toBe('false'));
  });
});
