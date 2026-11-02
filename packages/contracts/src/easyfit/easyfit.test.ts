import { describe, expect, test } from 'bun:test';
import { easyfitChipThresholdsSchema, easyfitPilotConfigSchema } from './config';
import { hashPhone, hashRawPhone, normalizePhone } from './phone';
import { adaptEasyfitPrototypeKeys, EASYFIT_PROTOTYPE_KEY_MAP } from './prototype-adapter';

describe('normalizePhone / hashPhone (tel10 of attr_v2.py)', () => {
  test('keeps the last 10 digits of whatever was typed', () => {
    expect(normalizePhone('+52 1 33 1234 5678')).toBe('3312345678');
    expect(normalizePhone('(33) 1234-5678')).toBe('3312345678');
    expect(normalizePhone(3312345678.0)).toBe('3312345678');
    expect(normalizePhone('5213312345678')).toBe('3312345678');
  });

  test('rejects short numbers, placeholders and blanks', () => {
    expect(normalizePhone('331234')).toBeNull();
    expect(normalizePhone('3333333333')).toBeNull();
    expect(normalizePhone('1212121212')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(Number.NaN)).toBeNull();
  });

  test('hashes to sha256 hex and matches a known vector', async () => {
    expect(await hashPhone('3312345678')).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPhone('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(await hashRawPhone('33 1234 5678')).toBe(await hashPhone('3312345678'));
    expect(await hashRawPhone('12')).toBeNull();
  });
});

describe('pilot config', () => {
  test('chip thresholds default to the docs/05 values and accept overrides', () => {
    const defaults = easyfitChipThresholdsSchema.parse(undefined);
    expect(defaults.costo_tour).toEqual({ verde_max: 300, rojo_min: 600 });
    expect(defaults.costo_alta_meta_quincena).toEqual({ verde_max: 960, rojo_min: 1500 });
    const partial = easyfitChipThresholdsSchema.parse({
      costo_alta_meta: { verde_max: 900, rojo_min: 1200 },
    });
    expect(partial.costo_alta_meta).toEqual({ verde_max: 900, rojo_min: 1200 });
    expect(partial.costo_alta_cohorte).toEqual({ verde_max: 1000, rojo_min: 1600 });
  });

  test('plan defaults to an empty list', () => {
    const minimal = easyfitPilotConfigSchema.shape.plan.parse(undefined);
    expect(minimal).toEqual([]);
  });
});

describe('prototype fixture adapter', () => {
  test('renames the month-specific keys and passes the rest through', () => {
    const adapted = adaptEasyfitPrototypeKeys({
      nov_en_curso: { altas: 1 },
      oct_quincenas: [],
      piloto: { ltv: 1 },
    });
    expect(Object.keys(adapted).sort()).toEqual([
      'mes_en_curso',
      'piloto',
      'quincenas_mes_anterior',
    ]);
    expect(Object.values(EASYFIT_PROTOTYPE_KEY_MAP)).not.toContain('nov_en_curso');
  });
});
