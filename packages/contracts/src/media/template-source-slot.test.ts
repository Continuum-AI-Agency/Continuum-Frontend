import { describe, expect, it } from 'bun:test';
import {
  duplicateSlotRoles,
  templateSlotAsRenderVariable,
  templateSlotDefaultFitsKind,
  templateSourceSlotEditRequestSchema,
} from './template-source-slot';

// A real slot from `aep_geometry.py library` on _current.aep — the corpus project the forge's own
// tests run against. Key format is slug(kind)__slug(layer name), deduped across ratio comps.
const DISCOUNT_SLOT = {
  key: 'text__discount-1',
  name: 'Discount_1',
  kind: 'text' as const,
  charBudget: 6,
  comps: ['DPLV 1080x1440', 'DPLV 1080x1920'],
  sample: '-35%',
};

describe('duplicateSlotRoles', () => {
  it('names a role two slots both claim', () => {
    expect(
      duplicateSlotRoles([
        { slotKey: 'a', role: 'price' },
        { slotKey: 'b', role: 'price' },
        { slotKey: 'c', role: 'legal_text' },
      ]),
    ).toEqual(['price']);
  });

  it('is silent when every role is claimed once', () => {
    expect(
      duplicateSlotRoles([
        { slotKey: 'a', role: 'price' },
        { slotKey: 'b', role: 'old_price' },
      ]),
    ).toEqual([]);
  });

  // The common case by far: most slots have no role at all, and "unassigned" is not a collision.
  it('does not treat several role-less slots as a clash', () => {
    expect(
      duplicateSlotRoles([
        { slotKey: 'a', role: null },
        { slotKey: 'b' },
        { slotKey: 'c', role: null },
      ]),
    ).toEqual([]);
  });
});

describe('templateSlotDefaultFitsKind', () => {
  it('accepts a value of the slot kind', () => {
    expect(templateSlotDefaultFitsKind('text', 'Half price')).toBe(true);
    expect(templateSlotDefaultFitsKind('number', 19.99)).toBe(true);
    expect(templateSlotDefaultFitsKind('boolean', false)).toBe(true);
    expect(templateSlotDefaultFitsKind('image', { assetId: crypto.randomUUID() })).toBe(true);
  });

  // `magenta` on a colour slot is one of the six pre-render row guards and a real 2026-09-05 live
  // failure: the render SUCCEEDS and hands back a frame with the wrong colour, which reads as a
  // pass. Refusing it at the edit is the only cheap place to catch it.
  it('refuses a colour that is not a hex triplet', () => {
    expect(templateSlotDefaultFitsKind('color', 'magenta')).toBe(false);
    expect(templateSlotDefaultFitsKind('color', '#1A1A1A')).toBe(true);
    expect(templateSlotDefaultFitsKind('color', '1A1A1A')).toBe(true);
  });

  it('refuses a scalar where a pinned asset belongs, and the reverse', () => {
    expect(templateSlotDefaultFitsKind('image', 'https://example.com/a.jpg')).toBe(false);
    expect(templateSlotDefaultFitsKind('number', '19.99')).toBe(false);
  });

  // No default is always valid — it means "nothing upstream has to be overridden".
  it('accepts an absent default for every kind', () => {
    expect(templateSlotDefaultFitsKind('color', null)).toBe(true);
    expect(templateSlotDefaultFitsKind('image', undefined)).toBe(true);
  });
});

describe('templateSlotAsRenderVariable', () => {
  it('carries the parse through when nobody has edited the slot', () => {
    const variable = templateSlotAsRenderVariable(DISCOUNT_SLOT, null);
    expect(variable.key).toBe('text__discount-1');
    expect(variable.label).toBe('Discount_1');
    expect(variable.kind).toBe('text');
    expect(variable.charBudget).toBe(6);
    expect(variable.comps).toEqual(['DPLV 1080x1440', 'DPLV 1080x1920']);
    expect(variable.sample).toBe('-35%');
    // A parse cannot know a slot is required — nothing in an AEP says a knob must be filled.
    expect(variable.required).toBe(false);
    expect(variable.role).toBeNull();
    expect(variable.roleSource).toBeNull();
  });

  it('lets an edit win, and marks the role as the human one', () => {
    const variable = templateSlotAsRenderVariable(DISCOUNT_SLOT, {
      publicName: 'Discount badge',
      role: 'discount_percent',
      charBudget: 4,
      required: true,
    });
    expect(variable.label).toBe('Discount badge');
    expect(variable.role).toBe('discount_percent');
    // Provenance matters downstream: human outranks agent, declared and detected in the registry.
    expect(variable.roleSource).toBe('human');
    expect(variable.charBudget).toBe(4);
    expect(variable.required).toBe(true);
  });

  // The bug this guards: an edit row exists because the person set a ROLE, and every other column
  // on it is null. Treating those nulls as answers would erase the parse's own budget and name.
  it('falls back to the parse for fields the edit has no opinion on', () => {
    const variable = templateSlotAsRenderVariable(DISCOUNT_SLOT, {
      publicName: null,
      role: 'discount_percent',
      charBudget: null,
      required: null,
    });
    expect(variable.label).toBe('Discount_1');
    expect(variable.charBudget).toBe(6);
  });

  it('does not let an all-whitespace name blank the label', () => {
    const variable = templateSlotAsRenderVariable(DISCOUNT_SLOT, { publicName: '   ' });
    expect(variable.label).toBe('Discount_1');
  });
});

describe('templateSourceSlotEditRequestSchema', () => {
  it('accepts a patch that names only the fields it changes', () => {
    const parsed = templateSourceSlotEditRequestSchema.safeParse({
      brandId: crypto.randomUUID(),
      slots: [{ slotKey: 'text__discount-1', role: 'discount_percent' }],
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses an unknown field rather than silently dropping it', () => {
    const parsed = templateSourceSlotEditRequestSchema.safeParse({
      brandId: crypto.randomUUID(),
      slots: [{ slotKey: 'a', rolle: 'price' }],
    });
    expect(parsed.success).toBe(false);
  });

  it('refuses a role outside the contract vocabulary', () => {
    const parsed = templateSourceSlotEditRequestSchema.safeParse({
      brandId: crypto.randomUUID(),
      slots: [{ slotKey: 'a', role: 'headline' }],
    });
    expect(parsed.success).toBe(false);
  });
});
