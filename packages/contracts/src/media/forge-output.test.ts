import { describe, expect, test } from 'bun:test';
import { forgeOutputFormatKey, forgeOutputSlot } from './forge-output';

describe('forgeOutputFormatKey', () => {
  test('two renders of one comp share a key; the random suffix is dropped', () => {
    expect(forgeOutputFormatKey('Producto_individual_con_descuento_9_16_ooqxxwb.jpg')).toBe(
      'producto_individual_con_descuento_9_16.jpg',
    );
    expect(forgeOutputFormatKey('Producto_individual_con_descuento_9_16_7wcqwv4.jpg')).toBe(
      forgeOutputFormatKey('Producto_individual_con_descuento_9_16_ooqxxwb.jpg'),
    );
  });

  test('a still and a video of the same comp are different outputs', () => {
    expect(forgeOutputFormatKey('RENDER_Card_1_wpwm3em.mp4')).not.toBe(
      forgeOutputFormatKey('RENDER_Card_1_wpwm3em.jpg'),
    );
  });

  test('different ratios never collide', () => {
    expect(forgeOutputFormatKey('Promo_16_9_abc1234.jpg')).not.toBe(
      forgeOutputFormatKey('Promo_1_1_abc1234.jpg'),
    );
  });
});

describe('forgeOutputSlot', () => {
  const ids = {
    renderSetId: '11111111-1111-4111-8111-111111111111',
    rowId: '22222222-2222-4222-8222-222222222222',
    renderRequestId: '33333333-3333-4333-8333-333333333333',
    renderJobId: '44444444-4444-4444-8444-444444444444',
  };

  test('set row + format is the identity, whatever job rendered it', () => {
    expect(forgeOutputSlot({ ...ids, format: 'promo_1_1.jpg' })).toBe(
      `${ids.renderSetId}:${ids.rowId}:promo_1_1.jpg`,
    );
    expect(forgeOutputSlot({ ...ids, renderJobId: ids.renderRequestId, format: 'x.jpg' })).toBe(
      forgeOutputSlot({ ...ids, format: 'x.jpg' }),
    );
  });

  test('off a set it falls back to the request, then the job', () => {
    expect(forgeOutputSlot({ ...ids, renderSetId: null, format: 'x.jpg' })).toBe(
      `${ids.renderRequestId}:x.jpg`,
    );
    expect(
      forgeOutputSlot({
        ...ids,
        renderSetId: null,
        rowId: null,
        renderRequestId: null,
        format: 'x.jpg',
      }),
    ).toBe(`${ids.renderJobId}:x.jpg`);
  });
});
