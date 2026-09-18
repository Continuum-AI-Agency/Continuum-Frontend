import { describe, expect, it } from 'bun:test';
import { readableLayerName } from './template-name';

describe('readableLayerName', () => {
  it('turns a raw layer name into words', () => {
    expect(readableLayerName('ref_price_text')).toBe('Price text');
    expect(readableLayerName('Ref_imagen_logo')).toBe('Imagen logo');
    expect(readableLayerName('ref_ precio_anterior')).toBe('Precio anterior');
    expect(readableLayerName('Ref_porcentaje_descuento')).toBe('Porcentaje descuento');
  });

  it('leaves a label someone typed alone', () => {
    expect(readableLayerName('Headline (by the member)')).toBe('Headline (by the member)');
    expect(readableLayerName('Key Color')).toBe('Key Color');
  });

  it('never returns an empty label', () => {
    expect(readableLayerName('ref_')).toBe('ref_');
  });
});
