import { describe, expect, test } from 'bun:test';
import { reelPresentationSchema } from './presentation';
import { presentationFromTemplate, type ReelTemplateShot, reelTemplateIdSchema } from './templates';

const inset = { assetId: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' };
const shots: ReelTemplateShot[] = [
  {
    id: 'hook',
    role: 'hook',
    durationSec: 4,
    lastWordEndSec: 3.2,
    location: 'gym',
    displayWord: 'tired',
  },
  {
    id: 'proof',
    role: 'proof',
    durationSec: 5,
    lastWordEndSec: 4.95,
    location: 'gym',
    displayWord: null,
  },
  {
    id: 'cta',
    role: 'cta',
    durationSec: 3,
    lastWordEndSec: 2.1,
    location: null,
    displayWord: 'press',
  },
];
const input = {
  shots,
  insetAsset: inset,
  headline: 'LEG DAY',
  cta: 'Shop now',
  accentHex: null,
  emphasisPhrases: ['legs'],
  productFocus: { x: 0.78, y: 0.55 },
  productHero: null,
  typeCard: null,
};

describe('reel templates', () => {
  test('every template expands to a presentation the schema accepts, with the line gate on', () => {
    for (const id of reelTemplateIdSchema.options) {
      const { presentation } = presentationFromTemplate(id, input);
      expect(reelPresentationSchema.parse(presentation)).toEqual(presentation);
      expect(presentation.speechGate).toBe('line@1');
      expect(presentation.transitions.map((t) => t.afterSceneId)).toEqual(['hook', 'proof']);
    }
  });

  test('an overlap is fitted to the room after the last word, and becomes a cut without room', () => {
    const { presentation } = presentationFromTemplate('ugc-native', input);
    expect(presentation.transitions).toEqual([
      { afterSceneId: 'hook', kind: 'j-cut', durationSec: 0.3 },
      { afterSceneId: 'proof', kind: 'cut', durationSec: 0 },
    ]);
  });

  test('the packshot rides the proof beat, and a template missing its input is refused', () => {
    const proof = presentationFromTemplate('product-proof', input);
    expect(proof.insetAsset).toBe(inset);
    expect(proof.presentation.insetAssetId).toBe(inset.assetId);
    expect(proof.presentation.events).toEqual([
      {
        kind: 'inset',
        anchor: { kind: 'shot', shotId: 'proof', edge: 'start', offsetSec: 0.3 },
        durationSec: 3.5,
      },
    ]);
    expect(presentationFromTemplate('karaoke-clean', input).insetAsset).toBeNull();
    expect(() => presentationFromTemplate('product-proof', { ...input, insetAsset: null })).toThrow(
      'template_needs_inset',
    );
    // Without a display word on the hook, cinematic-occlusion still needs its headline.
    expect(() =>
      presentationFromTemplate('cinematic-occlusion', {
        ...input,
        headline: null,
        shots: input.shots.map((shot) => ({ ...shot, displayWord: null })),
      }),
    ).toThrow('template_needs_headline');
    expect(
      presentationFromTemplate('bold-punch', { ...input, accentHex: '#FF3366' }).presentation
        .captionStyle.accentHex,
    ).toBe('#FF3366');
  });

  test('two transitions after one scene are refused before any clip is paid for', () => {
    const { presentation } = presentationFromTemplate('karaoke-clean', input);
    expect(
      reelPresentationSchema.safeParse({
        ...presentation,
        transitions: [...presentation.transitions, presentation.transitions[0]],
      }).success,
    ).toBe(false);
  });

  test('each template has its own motion signature, levels speech, and shares one room tone per location', () => {
    const signature = Object.fromEntries(
      reelTemplateIdSchema.options.map((id) => {
        const { presentation } = presentationFromTemplate(id, input);
        return [
          id,
          `${presentation.motion.punchIn}/${presentation.motion.shake}/${presentation.motion.drift}/${presentation.motion.moves.map((move) => move.kind).join('+')}/${presentation.ctaEntrance}`,
        ];
      }),
    );
    expect(signature).toEqual({
      'ugc-native': 'none/none/handheld/push-in+push-in+push-in/rise',
      'bold-punch': 'display/accents/none/push-in+push-in+push-in/punch',
      'karaoke-clean': 'display/none/handheld/push-in+push-in+push-in/rise',
      'product-proof': 'display/none/handheld/push-in+push-in+push-in+snap-zoom/slide',
      editorial: 'display/none/handheld/push-in+push-in+push-in/fade',
      'cinematic-occlusion': 'display/none/handheld/push-in+push-in+push-in/fade',
    });
    const proof = presentationFromTemplate('product-proof', input).presentation;
    expect(proof.motion.moves.find((move) => move.kind === 'snap-zoom')).toMatchObject({
      focusX: 0.78,
      focusY: 0.55,
      anchor: { shotId: 'proof' },
    });
    expect(proof.loudnessTargetLufs).toBe(-16);
    expect(proof.roomTone).toEqual([
      { sceneIds: ['hook', 'proof'], levelDb: -52 },
      { sceneIds: ['cta'], levelDb: -52 },
    ]);
    const cinematic = presentationFromTemplate('cinematic-occlusion', {
      ...input,
      shots: input.shots.map((shot) => ({ ...shot, displayWord: null })),
    }).presentation;
    expect(cinematic.events[0]).toMatchObject({ kind: 'headline', anchor: { offsetSec: 0 } });
    expect(cinematic.transitions[0]).toEqual({
      afterSceneId: 'hook',
      kind: 'dip-black',
      durationSec: 0.3,
    });
  });

  test('each template is a type system: display face, caption face, one accent, and its CTA', () => {
    const systems = Object.fromEntries(
      reelTemplateIdSchema.options.map((id) => {
        const { presentation } = presentationFromTemplate(id, input);
        const display = presentation.displayWords.length
          ? presentation.displayStyle.fontFamily
          : '-';
        return [
          id,
          `${display}/${presentation.captionStyle.fontFamily}/${presentation.captionStyle.accentHex}/${presentation.ctaStyle}`,
        ];
      }),
    );
    expect(systems).toEqual({
      'ugc-native': '-/Inter/#FFD100/plate',
      'bold-punch': 'Anton/Caveat/#FFD100/card',
      'karaoke-clean': 'Montserrat/Montserrat/#34D399/plate',
      'product-proof': 'Anton/Montserrat/#FFD100/plate',
      editorial: 'Cormorant Garamond/Cormorant Garamond/#E8412C/plate',
      'cinematic-occlusion': 'Anton/Inter/#FFFFFF/card',
    });
    const bold = presentationFromTemplate('bold-punch', input).presentation;
    expect(bold.displayWords.map((word) => [word.text, word.anchor])).toEqual([
      ['tired', { kind: 'shot', shotId: 'hook', edge: 'start', offsetSec: 0 }],
      ['press', { kind: 'shot', shotId: 'cta', edge: 'start', offsetSec: 0 }],
    ]);
    // The hook's display word replaces the old headline, and occlusion comes from the display track.
    expect(bold.events.some((event) => event.kind === 'headline')).toBe(false);
    expect(presentationFromTemplate('cinematic-occlusion', input).presentation.treatment).toBe(
      'none',
    );
  });

  test('the product hero and the type card are cutaways over a shot; the hero needs the packshot', () => {
    const { presentation, insetAsset } = presentationFromTemplate('editorial', {
      ...input,
      productHero: { shotId: 'proof', durationSec: 2.2, displayWord: 'brutalism' },
      typeCard: {
        shotId: 'cta',
        durationSec: 1.5,
        title: 'Three steps',
        lines: ['Hook', 'Proof', 'Ask'],
      },
    });
    expect(insetAsset).toBe(inset);
    expect(presentation.cards).toEqual([
      {
        kind: 'product-hero',
        anchor: { kind: 'shot', shotId: 'proof', edge: 'start', offsetSec: 0 },
        durationSec: 2.2,
        title: 'brutalism',
        lines: [],
      },
      {
        kind: 'type-card',
        anchor: { kind: 'shot', shotId: 'cta', edge: 'start', offsetSec: 0 },
        durationSec: 1.5,
        title: 'Three steps',
        lines: ['Hook', 'Proof', 'Ask'],
      },
    ]);
    expect(() =>
      presentationFromTemplate('editorial', {
        ...input,
        insetAsset: null,
        productHero: { shotId: 'proof', durationSec: 2, displayWord: null },
      }),
    ).toThrow('template_needs_inset');
  });

  test('a single never cuts away from her: its packshot is a picture-in-picture with its word, the CTA after her line', () => {
    // One take; compose places the packshot in a pause of her line (the owner: "let her speak").
    const single: ReelTemplateShot[] = [
      {
        id: 'take',
        role: 'hook',
        durationSec: 6,
        lastWordEndSec: 4.9,
        location: 'vanity',
        displayWord: 'pink',
      },
    ];
    const inset = { shotId: 'take', atSec: 1.6, durationSec: 2, displayWord: 'buttery' };
    for (const id of reelTemplateIdSchema.options) {
      const { presentation, insetAsset } = presentationFromTemplate(id, {
        ...input,
        shots: single,
        productHero: inset,
      });
      expect(presentation.cards).toEqual([]);
      expect(presentation.events.filter((event) => event.kind === 'inset')).toEqual([
        {
          kind: 'inset',
          anchor: { kind: 'shot', shotId: 'take', edge: 'start', offsetSec: 1.6 },
          durationSec: 2,
        },
      ]);
      expect(insetAsset).toEqual(inset && input.insetAsset);
      // The inset's word is the single's one display word, landing with the packshot.
      expect(presentation.displayWords.map((word) => [word.text, word.anchor])).toEqual(
        id === 'ugc-native'
          ? []
          : [['buttery', { kind: 'shot', shotId: 'take', edge: 'start', offsetSec: 1.6 }]],
      );
      expect(presentation.ctaStyle).toBe('plate');
    }
    // A headline gives way when the inset's word lands.
    const punch = presentationFromTemplate('bold-punch', {
      ...input,
      shots: single,
      productHero: inset,
    }).presentation;
    expect(punch.events.find((event) => event.kind === 'headline')?.durationSec).toBe(1.6);
    // A concept keeps its hero on the proof beat, its type card, and its CTA card.
    const concept = presentationFromTemplate('bold-punch', {
      ...input,
      productHero: { shotId: 'proof', durationSec: 2.2, displayWord: 'cold' },
      typeCard: { shotId: 'hook', durationSec: 2, title: 'Why it works', lines: [] },
    }).presentation;
    expect(concept.cards.map((card) => [card.kind, card.durationSec])).toEqual([
      ['product-hero', 2.2],
      ['type-card', 2],
    ]);
    expect(concept.ctaStyle).toBe('card');
  });

  test('a display word shows once a reel: the hero claims its word and no beat repeats one', () => {
    const repeated = presentationFromTemplate('karaoke-clean', {
      ...input,
      shots: input.shots.map((shot) => ({
        ...shot,
        displayWord: shot.id === 'proof' ? 'Satin' : shot.id === 'cta' ? 'TIRED' : shot.displayWord,
      })),
      productHero: { shotId: 'proof', durationSec: 2.2, displayWord: 'satin' },
    }).presentation;
    expect(repeated.cards[0]!.title).toBe('satin');
    expect(repeated.displayWords.map((word) => word.text)).toEqual(['tired']);
  });

  test('a caller that knows nothing of display words, heroes or type cards still compiles and gets none', () => {
    const { presentation } = presentationFromTemplate('karaoke-clean', {
      shots: [{ id: 'segment-0', role: 'hook', durationSec: 4, lastWordEndSec: 3, location: null }],
      insetAsset: null,
      headline: null,
      cta: null,
      accentHex: null,
      emphasisPhrases: [],
      productFocus: null,
    });
    expect(presentation.displayWords).toEqual([]);
    expect(presentation.cards).toEqual([]);
  });
});

describe('a display word lands on its own picture', () => {
  test('it waits out its incoming join, so it never shows over the previous speaker', () => {
    // Formats run 08-30-55-933Z: TRANQUILA over the interviewer while the answer's join led in.
    const interview: ReelTemplateShot[] = [
      {
        id: 'ask',
        role: 'hook',
        durationSec: 3,
        lastWordEndSec: 2.1,
        location: 'street',
        displayWord: null,
      },
      {
        id: 'answer',
        role: 'proof',
        durationSec: 3,
        lastWordEndSec: 2.4,
        location: 'street',
        displayWord: 'tranquila',
      },
    ];
    let overlapped = 0;
    for (const id of reelTemplateIdSchema.options) {
      const { presentation } = presentationFromTemplate(id, {
        ...input,
        shots: interview,
        insetAsset: id === 'product-proof' ? inset : null,
      });
      const word = presentation.displayWords.find((item) => item.text === 'tranquila');
      if (!word) continue;
      const join = presentation.transitions[0]!;
      const lead = join.kind === 'cut' ? 0 : join.durationSec;
      if (lead) overlapped += 1;
      expect({ id, offsetSec: word.anchor.kind === 'shot' ? word.anchor.offsetSec : null }).toEqual(
        {
          id,
          offsetSec: lead,
        },
      );
    }
    // At least one template joins with an overlap, so the rule is exercised, not vacuous.
    expect(overlapped).toBeGreaterThan(0);
  });
});
