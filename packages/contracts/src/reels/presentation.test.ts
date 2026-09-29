import { describe, expect, test } from 'bun:test';
import {
  reelFaceFor,
  reelAnalysisSchema,
  reelAnalysisWire,
  reelPresentationSchema,
  reelPresentationWire,
  reelResolvedPresentationSchema,
  reelResolvedWire,
} from './presentation';

const base = {
  version: 1 as const,
  captionPreset: 'keyword-punch@1' as const,
  cta: { mode: 'none' as const },
};

describe('reel presentation', () => {
  test('a treatment the renderer cannot draw is refused before any clip is paid for', () => {
    expect(
      reelPresentationSchema.safeParse({ ...base, treatment: 'subject-occlusion@1' }).success,
    ).toBe(false);
    expect(
      reelPresentationSchema.safeParse({
        ...base,
        treatment: 'subject-occlusion@1',
        events: [
          {
            kind: 'headline',
            anchor: { kind: 'shot', shotId: 'hook', edge: 'start', offsetSec: 0.3 },
            durationSec: 2.4,
            text: 'POST-SET RITUAL',
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      reelPresentationSchema.safeParse({ ...base, treatment: 'editorial-split@1' }).success,
    ).toBe(false);
    expect(reelPresentationSchema.safeParse(base).success).toBe(true);
    expect(reelPresentationSchema.shape.treatment.parse(undefined)).toBe('none');
  });

  // Shapes returned by the deployed continuum-reels rev 00002, before any field this workstream added.
  const rev2Analysis = {
    version: 1,
    scenes: [{ id: 'hook', durationSec: 3.2, width: 720, height: 1280, hasAudio: true, silence: [{ startSec: 2.8, endSec: 3.2 }], cutTimesSec: [] }],
  };
  const rev2Resolved = {
    version: 1,
    hash: 'a'.repeat(64),
    durationSec: 3.2,
    output: { width: 720, height: 1280, fps: 30 },
    sceneIds: ['hook'],
    words: [{ id: 'hook:0', text: 'Go', startSec: 0.4, endSec: 0.7, emphasized: false }],
    events: [{ kind: 'headline', startSec: 0, endSec: 2, text: 'GO' }],
    captionPreset: 'active-word@1',
    treatment: 'none',
    cta: { mode: 'text', text: 'Shop now' },
  };

  test('rev 00002 responses parse, and go back on the wire exactly as they came', () => {
    const analysis = reelAnalysisSchema.parse(rev2Analysis);
    expect(analysis.scenes[0].loudness).toEqual([]);
    expect(JSON.stringify(reelAnalysisWire(analysis))).toBe(JSON.stringify(rev2Analysis));
    const resolved = reelResolvedPresentationSchema.parse(rev2Resolved);
    expect(resolved.motion).toEqual([]);
    expect(resolved.ctaEntrance).toBe('rise');
    expect(JSON.stringify(reelResolvedWire(resolved))).toBe(JSON.stringify(rev2Resolved));
  });

  test('a presentation sends none of the post-rev-00002 keys until it uses them', () => {
    const rev2Keys = ['version', 'captionPreset', 'treatment', 'cta', 'emphasisPhrases', 'events', 'insetAssetId', 'soundAccents'];
    expect(Object.keys(reelPresentationWire(reelPresentationSchema.parse(base))).every((key) => rev2Keys.includes(key))).toBe(true);
    const used = reelPresentationWire(reelPresentationSchema.parse({ ...base, transitions: [{ afterSceneId: 'hook', kind: 'crossfade', durationSec: 0.3 }], ctaEntrance: 'fade' }));
    expect(Object.keys(used)).toContain('transitions');
    expect(Object.keys(used)).toContain('ctaEntrance');
    expect(Object.keys(used)).not.toContain('motion');
  });
});

describe('reelFaceFor', () => {
  test('a face Render ships is used as is', () => {
    expect(reelFaceFor({ brandKit: { typography: { primary: 'Inter' } } })).toEqual({
      family: 'Inter',
      substitutedFor: null,
    });
    expect(reelFaceFor({})).toEqual({ family: 'Montserrat', substitutedFor: null });
  });

  test("a face read off the brand's ads maps by the class the read gave it", () => {
    expect(
      reelFaceFor({
        ads: {
          typography: { primary: 'Barlow Condensed' },
          classes: { display: 'condensed-sans' },
        },
      }),
    ).toEqual({ family: 'Anton', substitutedFor: 'Barlow Condensed' });
  });

  test('any other face maps by its name, naming what it stands in for', () => {
    const face = (primary: string) => reelFaceFor({ brandKit: { typography: { primary } } });
    expect(face('Playfair Display')).toEqual({
      family: 'Cormorant Garamond',
      substitutedFor: 'Playfair Display',
    });
    expect(face('Work Sans').family).toBe('Inter');
    expect(face('Dancing Script').family).toBe('Caveat');
    expect(face('Proxima Nova')).toEqual({ family: 'Montserrat', substitutedFor: 'Proxima Nova' });
  });
});
