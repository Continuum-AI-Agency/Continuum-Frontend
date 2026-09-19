import { describe, expect, test } from 'bun:test';
import { changedKeys, forgeRenderPreviewRequestSchema } from './forge-render-preview';

const VARIABLES = [
  { key: 'headline', kind: 'text', reserved: false },
  { key: 'price', kind: 'number', reserved: false },
  { key: 'accent', kind: 'color', reserved: false },
  { key: 'hero', kind: 'image', reserved: false },
  { key: 'logo', kind: 'image', reserved: true },
] as const;

const PIN = '77777777-7777-4777-8777-777777777777';
const OTHER_PIN = '88888888-8888-4888-8888-888888888888';

describe('changedKeys', () => {
  const rendered = {
    headline: 'Launch day',
    price: 9.99,
    accent: '#FF4500',
    hero: { assetId: PIN, versionId: '99999999-9999-4999-8999-999999999999' },
    logo: { assetId: OTHER_PIN },
  };

  test('the values a render was made with are not changes, however they are spelled', () => {
    expect(
      changedKeys(
        VARIABLES,
        { headline: ' Launch day ', price: 9.99, accent: 'ff4500', hero: { assetId: PIN } },
        rendered,
      ),
    ).toEqual([]);
  });

  test('a new headline, a new picture, and a cleared value are changes; Continuum’s own fills are not', () => {
    expect(
      changedKeys(
        VARIABLES,
        { headline: 'Carrier has arrived', accent: '#ff4500', hero: [{ assetId: OTHER_PIN }] },
        rendered,
      ),
    ).toEqual(['headline', 'price', 'hero']);
  });

  test('an unrecorded render input rules nothing out: every value the row has is a change', () => {
    expect(
      changedKeys(VARIABLES, { headline: 'Hola', price: '', accent: '#000000' }, null),
    ).toEqual(['headline', 'accent']);
  });
});

describe('forgeRenderPreviewRequestSchema', () => {
  const request = {
    brandId: PIN,
    environment: 'Continuum_app',
    templateKey: '133',
    format: { id: '1:1', ratio: '1:1', comp: null },
    values: { ref_price_text: '$349.00', ref_imagen_producto: { assetId: PIN } },
    backdrop: { jobId: OTHER_PIN, fileName: 'Producto_1_1.jpg' },
  };

  test('a row, a format and the render to paint over', () => {
    expect(forgeRenderPreviewRequestSchema.parse(request)).toEqual(request);
    expect(
      forgeRenderPreviewRequestSchema.parse({ ...request, backdrop: null }).backdrop,
    ).toBeNull();
  });

  test('a field the server does not read is refused, not dropped', () => {
    expect(forgeRenderPreviewRequestSchema.safeParse({ ...request, url: 'x' }).success).toBe(false);
  });
});
