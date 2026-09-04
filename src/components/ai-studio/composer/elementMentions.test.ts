import { describe, expect, it } from 'bun:test';
import type { AgentMentionReference, ElementCategory, ElementRecord } from '@continuum/contracts';
import { ELEMENT_MEMBER_LIMIT, ELEMENT_PERSON_FALLBACK_LIMIT } from '@continuum/contracts';
import {
  appendElementGrounding,
  elementCategoryFolderKey,
  elementSuggestionsByCategory,
  elementToCanvasMentionSuggestion,
  expandElementMentions,
  parseElementCategoryFolderKey,
  readElementMention,
  refreshElementMentions,
} from './elementMentions';
import { toCanvasComposerReferences } from './useCanvasComposer';

const asset = (index: number): string =>
  `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const element = (overrides: Partial<ElementRecord> = {}): ElementRecord => ({
  id: 'element-1',
  brandId: 'brand-1',
  name: 'Nova',
  slug: 'nova',
  category: 'model' as ElementCategory,
  guidelines: null,
  rightsNote: 'own employee, consent on file',
  members: [
    { assetId: asset(1), position: 0 },
    { assetId: asset(2), position: 1 },
  ],
  referenceHistory: [],
  defaultReferenceAssetId: null,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

const mention = (record: ElementRecord): AgentMentionReference =>
  elementToCanvasMentionSuggestion(record)!.reference!;

describe('elementToCanvasMentionSuggestion', () => {
  it('resolves to the PINNED reference — one ref, not the members', () => {
    const suggestion = elementToCanvasMentionSuggestion(
      element({ defaultReferenceAssetId: asset(9), referenceHistory: [asset(9)] }),
    );
    expect(suggestion?.label).toBe('Nova');
    expect(suggestion?.reference?.id).toBe(asset(9));
    expect(suggestion?.reference?.metadata?.elementAssetIds).toEqual([asset(9)]);
    expect(suggestion?.reference?.metadata?.elementMode).toBe('pinned');
    expect(suggestion?.description).toBe('Model · pinned reference');
  });

  it('falls back to raw members in position order when nothing is pinned', () => {
    const suggestion = elementToCanvasMentionSuggestion(
      element({
        members: [
          { assetId: asset(2), position: 1 },
          { assetId: asset(1), position: 0 },
        ],
      }),
    );
    expect(suggestion?.reference?.metadata?.elementAssetIds).toEqual([asset(1), asset(2)]);
    expect(suggestion?.reference?.metadata?.elementMode).toBe('fallback');
    expect(suggestion?.description).toBe('Model · 2 images');
  });

  it('surfaces the members the person ceiling drops instead of truncating silently', () => {
    const members = Array.from({ length: 6 }, (_unused, index) => ({
      assetId: asset(index + 1),
      position: index,
    }));
    const suggestion = elementToCanvasMentionSuggestion(element({ members }));
    expect(suggestion?.reference?.metadata?.elementAssetIds).toHaveLength(
      ELEMENT_PERSON_FALLBACK_LIMIT,
    );
    expect(suggestion?.reference?.metadata?.elementDropped).toBe(6 - ELEMENT_PERSON_FALLBACK_LIMIT);
    expect(suggestion?.description).toContain('2 over the limit');
  });

  it('gives a non-person Element the full member budget', () => {
    const members = Array.from({ length: ELEMENT_MEMBER_LIMIT }, (_unused, index) => ({
      assetId: asset(index + 1),
      position: index,
    }));
    const suggestion = elementToCanvasMentionSuggestion(
      element({ category: 'product', members, name: 'Aero Bottle' }),
    );
    expect(suggestion?.reference?.metadata?.elementAssetIds).toHaveLength(ELEMENT_MEMBER_LIMIT);
    expect(suggestion?.reference?.metadata?.elementDropped).toBe(0);
  });

  it('does not offer an Element that would contribute nothing', () => {
    expect(elementToCanvasMentionSuggestion(element({ members: [] }))).toBeNull();
  });

  it('rides the media_asset path so the composer resolves it server-side', () => {
    const suggestion = elementToCanvasMentionSuggestion(element());
    expect(suggestion?.reference?.type).toBe('media_asset');
    expect(suggestion?.reference?.source).toBe('canvas');
    expect(suggestion?.badge).toBe('element');
  });
});

describe('elementSuggestionsByCategory', () => {
  it('groups by category in the canonical order and skips empty categories', () => {
    const grouped = elementSuggestionsByCategory([
      element({ id: 'p', name: 'Aero Bottle', category: 'product' }),
      element({ id: 'm', name: 'Nova', category: 'model' }),
      element({ id: 's', name: 'Grain', category: 'style' }),
    ]);
    expect([...grouped.keys()]).toEqual(['model', 'product', 'style']);
    expect(grouped.get('model')?.map((item) => item.label)).toEqual(['Nova']);
  });

  it('round-trips a category folder key', () => {
    expect(parseElementCategoryFolderKey(elementCategoryFolderKey('moodboard'))).toBe('moodboard');
    expect(parseElementCategoryFolderKey('canvas-context:elements:nonsense')).toBeNull();
    expect(parseElementCategoryFolderKey('canvas-context:signals')).toBeNull();
  });
});

describe('readElementMention', () => {
  it('reads an Element back off its reference', () => {
    expect(readElementMention(mention(element()))).toEqual({
      elementId: 'element-1',
      name: 'Nova',
      category: 'model',
      assetIds: [asset(1), asset(2)],
      mode: 'fallback',
      droppedCount: 0,
    });
  });

  it('ignores an ordinary media grab', () => {
    expect(
      readElementMention({
        id: asset(3),
        type: 'media_asset',
        label: 'Hero',
        source: 'canvas',
        metadata: { kind: 'image' },
      }),
    ).toBeNull();
  });
});

describe('refreshElementMentions', () => {
  it('replaces cached mention assets with the current approved sheet', async () => {
    const refreshed = await refreshElementMentions([mention(element())], async () =>
      element({
        defaultReferenceAssetId: asset(9),
        referenceHistory: [asset(9)],
      }),
    );
    expect(refreshed[0]?.id).toBe(asset(9));
    expect(refreshed[0]?.metadata?.elementAssetIds).toEqual([asset(9)]);
  });
});

describe('expandElementMentions', () => {
  it('attaches a fallback Element’s remaining members after the picked ref', () => {
    const expanded = expandElementMentions([mention(element())]);
    expect(expanded.references.map((reference) => reference.id)).toEqual([asset(1), asset(2)]);
    expect(expanded.references[1]?.label).toBe('Nova (2/2)');
    expect(expanded.elements).toHaveLength(1);
  });

  it('adds nothing for a pinned Element — one reference is the whole point', () => {
    const pinned = element({ defaultReferenceAssetId: asset(9), referenceHistory: [asset(9)] });
    const expanded = expandElementMentions([mention(pinned)]);
    expect(expanded.references.map((reference) => reference.id)).toEqual([asset(9)]);
    expect(expanded.grounding).toBe(
      'Reference image #1 is the model reference for "Nova". Preserve it exactly; do not redraw, restyle or improve it.',
    );
  });

  it('composes two Elements: both ref sets, both labels, correct slots', () => {
    const model = element({ defaultReferenceAssetId: asset(9), referenceHistory: [asset(9)] });
    const product = element({
      id: 'element-2',
      name: 'Aero Bottle',
      slug: 'aero-bottle',
      category: 'product',
      defaultReferenceAssetId: asset(10),
      referenceHistory: [asset(10)],
    });
    const expanded = expandElementMentions([mention(model), mention(product)]);

    expect(expanded.references.map((reference) => reference.id)).toEqual([asset(9), asset(10)]);
    expect(expanded.elements.map((item) => item.name)).toEqual(['Nova', 'Aero Bottle']);
    expect(expanded.grounding.split('\n')).toEqual([
      'Reference image #1 is the model reference for "Nova". Preserve it exactly; do not redraw, restyle or improve it.',
      'Reference image #2 is the product reference for "Aero Bottle". Preserve it exactly; do not redraw, restyle or improve it.',
    ]);
  });

  it('numbers slots past an ordinary media grab and names a fallback Element’s span', () => {
    const hero: AgentMentionReference = {
      id: asset(5),
      type: 'media_asset',
      label: 'Hero',
      source: 'canvas',
    };
    const expanded = expandElementMentions([hero, mention(element())]);
    expect(expanded.references.map((reference) => reference.id)).toEqual([
      asset(5),
      asset(1),
      asset(2),
    ]);
    expect(expanded.grounding).toBe(
      'Reference image #2 is the model reference for "Nova". Preserve it exactly; do not redraw, restyle or improve it. ' +
        'Reference images #2–#3 are all the same model.',
    );
  });

  it('keeps skills and signals untouched', () => {
    const skill: AgentMentionReference = {
      id: 'skill-1',
      type: 'skill',
      label: 'bold-product-lighting',
      source: 'canvas',
    };
    const expanded = expandElementMentions([skill]);
    expect(expanded.references).toEqual([skill]);
    expect(expanded.grounding).toBe('');
    expect(expanded.elements).toEqual([]);
  });

  it('collapses the same Element mentioned twice into one grab', () => {
    const reference = mention(element());
    const expanded = expandElementMentions([reference, reference]);
    expect(expanded.references.map((item) => item.id)).toEqual([asset(1), asset(2)]);
    expect(expanded.grounding.split('\n')).toHaveLength(1);
  });
});

describe('the wire payload a two-Element prompt produces', () => {
  it('carries BOTH Elements’ refs as media_asset grabs plus both labels', () => {
    const model = element({ defaultReferenceAssetId: asset(9), referenceHistory: [asset(9)] });
    const product = element({
      id: 'element-2',
      name: 'Aero Bottle',
      slug: 'aero-bottle',
      category: 'product',
      members: [
        { assetId: asset(11), position: 0 },
        { assetId: asset(12), position: 1 },
      ],
    });
    const grounded = expandElementMentions([mention(model), mention(product)]);

    // The composer resolves exactly these types server-side; an Element rides the
    // media_asset path rather than inventing a wire type nothing would resolve.
    expect(toCanvasComposerReferences(grounded.references)).toEqual([
      { type: 'media_asset', id: asset(9), label: 'Nova' },
      { type: 'media_asset', id: asset(11), label: 'Aero Bottle' },
      { type: 'media_asset', id: asset(12), label: 'Aero Bottle (2/2)' },
    ]);

    expect(
      appendElementGrounding('product shot of @Nova holding @Aero Bottle', grounded.grounding),
    ).toBe(`product shot of @Nova holding @Aero Bottle

<elements>
Reference image #1 is the model reference for "Nova". Preserve it exactly; do not redraw, restyle or improve it.
Reference image #2 is the product reference for "Aero Bottle". Preserve it exactly; do not redraw, restyle or improve it. Reference images #2–#3 are all the same product.
</elements>`);
  });
});

describe('appendElementGrounding', () => {
  it('rides the grounding into the wire prompt', () => {
    expect(appendElementGrounding('a shot of @Nova', 'Reference image #1 is …')).toBe(
      'a shot of @Nova\n\n<elements>\nReference image #1 is …\n</elements>',
    );
  });

  it('leaves the prompt alone when there is nothing to ground', () => {
    expect(appendElementGrounding('a shot', '')).toBe('a shot');
  });

  it('drops lines rather than blowing the schema’s 4000-char prompt ceiling', () => {
    const prompt = 'x'.repeat(3960);
    const grounded = appendElementGrounding(prompt, ['first line', 'second line'].join('\n'));
    expect(grounded.length).toBeLessThanOrEqual(4000);
    expect(grounded).toContain('first line');
    expect(grounded).not.toContain('second line');
  });

  it('keeps the prompt intact when not even one line fits', () => {
    const prompt = 'x'.repeat(3999);
    expect(appendElementGrounding(prompt, 'first line')).toBe(prompt);
  });
});
