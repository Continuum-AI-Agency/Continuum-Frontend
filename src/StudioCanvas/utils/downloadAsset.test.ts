import { describe, expect, it, mock } from 'bun:test';
import { resolveDownloadUrl } from './downloadAsset';

const BRAND = '6a49e1a8-0ee8-4101-bed7-1bdc8fd5e088';
const PATH = `${BRAND}/canvas-creations/1536x2752/calm violet otter.jpg`;
const ORIGIN = 'https://proj.supabase.co/storage/v1';

function token(expSeconds: number): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ exp: expSeconds })}.sig`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const signedUrl = (route: 'object' | 'render/image', bucket: string, expSeconds: number) =>
  `${ORIGIN}/${route}/sign/${bucket}/${encodeURI(PATH)}?token=${token(expSeconds)}`;

const FRESH = `${ORIGIN}/object/sign/brand-profile-assets/fresh?token=new`;

describe('resolveDownloadUrl', () => {
  it('re-signs an expired original to a fresh link, scoped to the brand in the path', async () => {
    const sign = mock(async () => FRESH);
    const url = signedUrl('object', 'brand-profile-assets', nowSeconds() - 60);

    await expect(resolveDownloadUrl(url, sign)).resolves.toBe(FRESH);
    expect(sign).toHaveBeenCalledWith(BRAND, { bucket: 'brand-profile-assets', path: PATH });
  });

  it('trades a live 480px display derivative for the original', async () => {
    const sign = mock(async () => FRESH);
    const url = signedUrl('render/image', 'media-library', nowSeconds() + 600);

    await expect(resolveDownloadUrl(url, sign)).resolves.toBe(FRESH);
    expect(sign).toHaveBeenCalledWith(BRAND, { bucket: 'media-library', path: PATH });
  });

  it('never hands back a dead link when re-signing fails', async () => {
    const sign = mock(async () => {
      throw new Error('network');
    });
    const expired = signedUrl('object', 'brand-profile-assets', nowSeconds() - 60);

    await expect(resolveDownloadUrl(expired, sign)).resolves.toBeNull();
  });

  it('falls back to a still-live original, but not to a derivative', async () => {
    const sign = mock(async () => null);
    const liveOriginal = signedUrl('object', 'brand-profile-assets', nowSeconds() + 600);
    const liveDerivative = signedUrl('render/image', 'brand-profile-assets', nowSeconds() + 600);

    await expect(resolveDownloadUrl(liveOriginal, sign)).resolves.toBe(liveOriginal);
    await expect(resolveDownloadUrl(liveDerivative, sign)).resolves.toBeNull();
  });

  it('follows anything that is not a signed Storage URL as is', async () => {
    const sign = mock(async () => FRESH);
    for (const url of [
      'data:image/png;base64,AAAA',
      'blob:https://app/1',
      'https://cdn.example/a.jpg',
    ]) {
      await expect(resolveDownloadUrl(url, sign)).resolves.toBe(url);
    }
    expect(sign).not.toHaveBeenCalled();
  });
});
