import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { MediaAsset, SetBrandLogoRequest } from '@continuum/contracts';
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@/components/library/__tests__/renderWithCreativeI18n';

let role: string | null | undefined = 'operator';
const sent: SetBrandLogoRequest[] = [];
const roles = await import('@/lib/library/useBrandRole');
mock.module('@/lib/library/useBrandRole', () => ({ ...roles, useBrandRole: () => role }));
mock.module('@/lib/brands/brandLogo', () => ({
  setBrandLogo: async (request: SetBrandLogoRequest) => {
    sent.push(request);
    return { logoPath: `${request.brandId}/branding/logo.png` };
  },
}));

const { SetBrandLogoButton } = await import('./SetBrandLogoButton');

const BRAND = '00000000-0000-4000-8000-0000000000b1';
const image = {
  id: '11111111-1111-4111-8111-111111111111',
  brandId: BRAND,
  kind: 'image',
} as unknown as MediaAsset;

beforeEach(() => {
  role = 'operator';
  sent.length = 0;
});
afterEach(cleanup);

describe('SetBrandLogoButton', () => {
  it('makes the Library image the brand logo', async () => {
    const view = render(<SetBrandLogoButton brandId={BRAND} asset={image} />);
    fireEvent.click(view.getByRole('button', { name: /Set as brand logo/ }));
    await waitFor(() =>
      expect(sent).toEqual([{ source: 'library', brandId: BRAND, assetId: image.id }]),
    );
  });

  it('is not offered for a video', () => {
    const view = render(
      <SetBrandLogoButton brandId={BRAND} asset={{ ...image, kind: 'video' } as MediaAsset} />,
    );
    expect(view.queryByTestId('set-brand-logo')).toBeNull();
  });

  it('is not offered to a viewer, nor while the role is loading', () => {
    role = 'viewer';
    expect(
      render(<SetBrandLogoButton brandId={BRAND} asset={image} />).queryByTestId('set-brand-logo'),
    ).toBeNull();
    cleanup();
    role = undefined;
    expect(
      render(<SetBrandLogoButton brandId={BRAND} asset={image} />).queryByTestId('set-brand-logo'),
    ).toBeNull();
  });
});
