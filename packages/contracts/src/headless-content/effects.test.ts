import { describe, expect, it } from 'bun:test';
import {
  effectOpSchema,
  GEOMETRY_OPS,
  HEADLESS_EFFECTS,
  headlessEffect,
  headlessEffectSchema,
  resolveEffect,
  stillEffectOps,
  withBrandInk,
} from './effects';

describe('the effects catalog', () => {
  it('holds 32 unique catalog effects, each a valid entry', () => {
    expect(HEADLESS_EFFECTS).toHaveLength(32);
    expect(new Set(HEADLESS_EFFECTS.map((effect) => effect.id)).size).toBe(32);
    for (const effect of HEADLESS_EFFECTS) {
      expect(headlessEffectSchema.safeParse(effect).success).toBe(true);
      expect(effect.origin).toBe('catalog');
    }
  });

  it('refuses a second lens and a third stamp (an agent composes within the same bounds)', () => {
    const base = headlessEffect('fish-eye');
    if (!base) throw new Error('fish-eye missing');
    const lens = base.ops.find((op) => op.op === 'lens');
    expect(headlessEffectSchema.safeParse({ ...base, ops: [...base.ops, lens] }).success).toBe(
      false,
    );
    const stamp = effectOpSchema.parse({ op: 'stamp', kind: 'rec', corner: 'tr' });
    expect(headlessEffectSchema.safeParse({ ...base, ops: [stamp, stamp, stamp] }).success).toBe(
      false,
    );
  });

  it('never sends Render a brand placeholder: brand ink resolves to the accent', () => {
    for (const effect of HEADLESS_EFFECTS)
      expect(JSON.stringify(withBrandInk(effect.ops, '#123456'))).not.toContain('"brand"');
  });

  it('gives a still no stamp (its read-back would read one as the copy)', () => {
    for (const effect of HEADLESS_EFFECTS)
      expect(stillEffectOps(effect.ops).some((op) => op.op === 'stamp')).toBe(false);
    expect(headlessEffect('camcorder')?.ops.some((op) => op.op === 'stamp')).toBe(true);
  });

  it('refuses a second dust or a second light leak', () => {
    const dust = headlessEffect('dust');
    const leak = headlessEffect('light-leak');
    if (!dust || !leak) throw new Error('dust or light-leak missing');
    expect(
      headlessEffectSchema.safeParse({ ...dust, ops: [...dust.ops, ...dust.ops] }).success,
    ).toBe(false);
    expect(
      headlessEffectSchema.safeParse({ ...leak, ops: [...leak.ops, ...leak.ops] }).success,
    ).toBe(false);
  });

  it('names the geometry ops Render also applies to the person matte', () => {
    expect([...GEOMETRY_OPS].sort()).toEqual(['bars', 'lens', 'weave']);
  });

  it('persists what the catalog said, capture included', () => {
    const resolved = resolveEffect(headlessEffect('golden-hour')!);
    expect(resolved.capture?.reel).toContain('golden-hour');
    expect(resolveEffect(headlessEffect('vhs')!).capture).toBeUndefined();
  });
});
