import { describe, expect, it } from 'bun:test';
import {
  type ArtDirection,
  artDirectionSchema,
  EMPTY_QUALITY_WORDS,
  gradeArtDirection,
  renderArtDirection,
  summarizeArtDirection,
} from './art-direction';

const direction = (overrides: Partial<ArtDirection> = {}): ArtDirection =>
  artDirectionSchema.parse({
    heroSubject: 'A founder in a navy knit sweater',
    action: 'holding the bottle at chest height and looking into the lens',
    environment: 'a sunlit kitchen counter with morning haze',
    camera: { angle: 'low-angle', framing: 'medium-close-up', lens: '35mm environmental' },
    light: { direction: 'camera-left', quality: 'hard-sun', shadow: 'crisp edges falling right' },
    palette: { dominant: 'deep navy', support: 'warm white', accent: 'orange peel' },
    materials: ['brushed aluminium cap', 'wet glass'],
    depth: { foreground: 'a blurred countertop edge', background: 'a soft window wall' },
    copySafeZone: { location: 'upper-third', coveragePct: 30 },
    identityLock: { preserve: ['facial structure', 'hair', 'skin tone', 'wardrobe'] },
    motion: 'a slow push-in as the subject lifts the bottle',
    ...overrides,
  });

describe('artDirectionSchema', () => {
  it('closes the vocabulary where a real decision exists', () => {
    expect(
      artDirectionSchema.safeParse({
        ...direction(),
        camera: { ...direction().camera, angle: 'cinematic' },
      }).success,
    ).toBe(false);
    expect(
      artDirectionSchema.safeParse({
        ...direction(),
        light: { ...direction().light, quality: 'dramatic' },
      }).success,
    ).toBe(false);
  });

  it('rejects a copy-safe zone that is a background or too small to hold a headline', () => {
    expect(
      artDirectionSchema.safeParse({
        ...direction(),
        copySafeZone: { location: 'top', coveragePct: 80 },
      }).success,
    ).toBe(false);
    expect(
      artDirectionSchema.safeParse({
        ...direction(),
        copySafeZone: { location: 'top', coveragePct: 2 },
      }).success,
    ).toBe(false);
  });

  it('treats everything past the core five as optional so a partial direction still parses', () => {
    const core = {
      heroSubject: 'A bottle',
      action: 'standing on a counter',
      environment: 'a kitchen',
      camera: { angle: 'eye-level', framing: 'medium', lens: '50mm' },
      light: { direction: 'front', quality: 'soft-window', shadow: 'soft falloff' },
      palette: { dominant: 'navy', support: 'white', accent: 'orange' },
    };
    expect(artDirectionSchema.safeParse(core).success).toBe(true);
  });
});

describe('renderArtDirection', () => {
  it('gives the still panel a copy-safe zone and the single-frame rule', () => {
    const prompt = renderArtDirection(direction(), { target: 'still-panel' });

    expect(prompt).toContain('upper third');
    expect(prompt).toContain('30%');
    expect(prompt).toContain('headline copy added later');
    expect(prompt).toContain('no panels, collage, split screens');
    expect(prompt).not.toContain('Motion:');
    expect(prompt).not.toContain('One continuous shot');
  });

  it('gives the motion target a movement clause and no copy-safe zone', () => {
    const prompt = renderArtDirection(direction(), { target: 'veo-motion' });

    expect(prompt).toContain('Motion: a slow push-in as the subject lifts the bottle.');
    expect(prompt).toContain('One continuous shot, no cuts.');
    expect(prompt).not.toContain('headline copy');
    expect(prompt).not.toContain('30%');
  });

  it('falls back to a stated default rather than emitting no movement at all', () => {
    const prompt = renderArtDirection(direction({ motion: null }), { target: 'veo-motion' });
    expect(prompt).toContain('Motion: Subject-led movement; the camera holds steady.');
  });

  it('carries the identity lock into BOTH targets — the panel is the identity carrier', () => {
    for (const target of ['still-panel', 'veo-motion'] as const) {
      expect(renderArtDirection(direction(), { target })).toContain(
        'Preserve exactly: facial structure, hair, skin tone, wardrobe.',
      );
    }
  });

  it('always forbids rendered text — captions are burned later, never generated', () => {
    for (const target of ['still-panel', 'veo-motion'] as const) {
      expect(renderArtDirection(direction(), { target })).toContain(
        'Do not render any text, letters, captions, logos, or watermarks',
      );
    }
  });

  it('is pure: the same direction renders byte-identically every time', () => {
    const once = renderArtDirection(direction(), { target: 'still-panel' });
    const twice = renderArtDirection(direction(), { target: 'still-panel' });
    expect(once).toBe(twice);
  });

  it('omits optional blocks instead of emitting empty labels', () => {
    const bare = artDirectionSchema.parse({
      heroSubject: 'A bottle',
      action: 'standing on a counter',
      environment: 'a kitchen',
      camera: { angle: 'eye-level', framing: 'medium', lens: '50mm' },
      light: { direction: 'front', quality: 'soft-window', shadow: 'soft falloff' },
      palette: { dominant: 'navy', support: 'white', accent: 'orange' },
    });
    const prompt = renderArtDirection(bare, { target: 'still-panel' });

    expect(prompt).not.toContain('Materials:');
    expect(prompt).not.toContain('Depth:');
    expect(prompt).not.toContain('Preserve exactly:');
    expect(prompt).not.toContain('Must include:');
  });
});

describe('gradeArtDirection', () => {
  it('scores a complete direction at the top with nothing missing', () => {
    const grade = gradeArtDirection(direction());
    expect(grade.missing).toEqual([]);
    expect(grade.buzzwords).toEqual([]);
    expect(grade.score).toBe(10);
  });

  it('names the dimensions a partial direction never decided', () => {
    const grade = gradeArtDirection(
      direction({ depth: undefined, copySafeZone: null, identityLock: null }),
    );
    expect(grade.missing).toEqual(['depth', 'copySafeZone', 'identityLock']);
    expect(grade.score).toBeLessThan(10);
  });

  it('catches empty quality words hiding inside a typed direction', () => {
    const grade = gradeArtDirection(direction({ environment: 'a cinematic kitchen, 8k' }));
    expect(grade.buzzwords).toContain('cinematic');
    expect(grade.buzzwords).toContain('8k');
  });

  it('grades the freeform string a legacy caller still sends', () => {
    const weak = gradeArtDirection('Cinematic, ultra detailed, 8k, aesthetic product shot');
    expect(weak.buzzwords.length).toBeGreaterThan(2);
    expect(weak.missing).toContain('camera');
    expect(weak.missing).toContain('light');
    expect(weak.score).toBe(0);

    const strong = gradeArtDirection(
      'Low-angle 35mm frame of a founder holding the bottle, hard sun from camera-left with crisp shadows, ' +
        'deep navy palette with orange accent, blurred foreground counter against a soft window background, ' +
        'clear space in the upper third for the headline, preserve the same person across shots.',
    );
    expect(strong.buzzwords).toEqual([]);
    expect(strong.missing).toEqual([]);
  });

  it('never returns a negative score however many buzzwords are stacked', () => {
    const grade = gradeArtDirection(EMPTY_QUALITY_WORDS.join(', '));
    expect(grade.score).toBe(0);
  });
});

describe('summarizeArtDirection', () => {
  it('reads as a scannable index label', () => {
    expect(summarizeArtDirection(direction())).toBe(
      'medium close up low angle · 35mm environmental · hard sun camera left · deep navy/warm white/orange peel',
    );
  });
});
