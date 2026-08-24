import { describe, expect, it } from 'bun:test';
import { groupWordsIntoCues } from '../../StudioCanvas/utils/splice/captionCues';
import { CAPTION_FONTS } from './captionFonts';
import {
  applyCaptionPreset,
  brandCaptionFontStatus,
  CAPTION_PRESET_IDS,
  CAPTION_PRESETS,
  captionFontFamiliesFor,
  isCaptionPresetId,
  resolveCaptionPreset,
} from './captionPresets';
import { DEFAULT_CAPTION_STYLE } from './clipCaptionStyle';

describe('the catalog', () => {
  it('ships exactly the six ids the FROZEN action registry enum declares', () => {
    // packages/contracts/src/ai-studio/action-registry.ts video.subtitles.config.preset.
    // A preset the registry cannot name is a preset the node can never select.
    expect([...CAPTION_PRESET_IDS].sort()).toEqual([
      'boxed',
      'classic',
      'fusion',
      'glide',
      'pop',
      'pulse',
    ]);
    expect(CAPTION_PRESETS.map((p) => p.id).sort()).toEqual([...CAPTION_PRESET_IDS].sort());
  });

  it('has unique ids and a label and description on every preset', () => {
    expect(new Set(CAPTION_PRESETS.map((p) => p.id)).size).toBe(CAPTION_PRESETS.length);
    for (const preset of CAPTION_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });

  it('names only registrable faces, so no preset can silently fall back to Helvetica', () => {
    for (const preset of CAPTION_PRESETS) {
      if (!preset.fontFamily) continue;
      expect(Object.keys(CAPTION_FONTS)).toContain(preset.fontFamily);
      // The declared face and the style's family must agree, or the wrong face is fetched.
      expect(preset.style.fontFamily).toBe(preset.fontFamily);
    }
  });

  it('gives every preset a complete, renderable style', () => {
    for (const preset of CAPTION_PRESETS) {
      expect(typeof preset.style.textColor).toBe('string');
      expect(typeof preset.style.highlightColor).toBe('string');
      expect(typeof preset.style.outlineColor).toBe('string');
      expect(preset.style.position?.xFrac).toBeGreaterThan(0);
      expect(preset.style.position?.yFrac).toBeGreaterThan(0);
      expect(preset.style.fontSizeFrac).toBeGreaterThan(0);
    }
  });
});

describe('classic — the compatibility pin', () => {
  it('deep-equals DEFAULT_CAPTION_STYLE, which is what makes it a render golden', () => {
    // If this ever drifts, every existing project re-renders differently. That is the
    // whole reason the preset layer resolves by value rather than by id.
    expect(resolveCaptionPreset('classic').style).toEqual(DEFAULT_CAPTION_STYLE);
  });

  it('keeps yFrac 0.88 — the ruling that existing renders outrank the safe area', () => {
    expect(resolveCaptionPreset('classic').style.position?.yFrac).toBe(0.88);
  });

  it('adds no animation, no uppercase and no background mode', () => {
    const { style } = resolveCaptionPreset('classic');
    expect(style.animation).toBeUndefined();
    expect(style.uppercase).toBeUndefined();
    expect(style.backgroundMode).toBeUndefined();
    expect(style.emphasis).toBeUndefined();
  });

  it('does not share its position object with the module default', () => {
    const style = applyCaptionPreset(resolveCaptionPreset('classic'));
    style.position!.yFrac = 0.1;
    expect(DEFAULT_CAPTION_STYLE.position?.yFrac).toBe(0.88);
    expect(resolveCaptionPreset('classic').style.position?.yFrac).toBe(0.88);
  });
});

describe('the binding rulings', () => {
  it('pulse ships fontSizeFrac 0.082', () => {
    expect(resolveCaptionPreset('pulse').style.fontSizeFrac).toBe(0.082);
  });

  it('every preset but classic clears the platform bottom reserve', () => {
    for (const preset of CAPTION_PRESETS) {
      if (preset.id === 'classic') continue;
      const yFrac = preset.style.position!.yFrac;
      expect(yFrac).toBeGreaterThanOrEqual(0.15);
      expect(yFrac).toBeLessThanOrEqual(0.65);
    }
  });
});

describe('the loud presets turn karaoke off', () => {
  it('never stacks emphasis colour on top of an active-word recolour', () => {
    // Three signals fighting on one word (active-yellow + emphasis-green + scale) is the
    // difference between "professional" and "spammy".
    for (const preset of CAPTION_PRESETS) {
      const emphasisIsColour = preset.style.emphasis?.color !== undefined;
      const activeIsColour = preset.style.activeWordMode === 'fill';
      if (emphasisIsColour && activeIsColour) {
        expect(preset.style.emphasis?.color).not.toBe(preset.style.highlightColor);
      }
    }
    expect(resolveCaptionPreset('pop').style.activeWordMode).toBe('none');
    expect(resolveCaptionPreset('pulse').style.activeWordMode).toBe('none');
  });

  it('keeps entry animations inside a spoken word slot (~333ms)', () => {
    for (const preset of CAPTION_PRESETS) {
      const anim = preset.style.animation;
      if (!anim || anim.kind === 'none') continue;
      if (anim.anchor === 'cue') continue; // a cue-anchored entry runs once, not per word
      expect(anim.durationSec ?? 0).toBeLessThanOrEqual(0.333);
      // Below ~180ms at 30fps there are not enough frames to read the motion.
      expect(anim.durationSec ?? 0).toBeGreaterThanOrEqual(0.18);
    }
  });
});

describe('resolveCaptionPreset', () => {
  it('falls back to classic for unknown, empty and absent ids', () => {
    expect(resolveCaptionPreset(undefined).id).toBe('classic');
    expect(resolveCaptionPreset(null).id).toBe('classic');
    expect(resolveCaptionPreset('').id).toBe('classic');
    expect(resolveCaptionPreset('hormozi-5').id).toBe('classic');
  });

  it('round-trips every declared id', () => {
    for (const id of CAPTION_PRESET_IDS) expect(resolveCaptionPreset(id).id).toBe(id);
  });

  it('isCaptionPresetId guards the boundary', () => {
    expect(isCaptionPresetId('boxed')).toBe(true);
    expect(isCaptionPresetId('Boxed')).toBe(false);
    expect(isCaptionPresetId(7)).toBe(false);
    expect(isCaptionPresetId(undefined)).toBe(false);
  });
});

describe('applyCaptionPreset', () => {
  const brand = { colors: ['#1c7ed6'], typography: { primary: 'Inter' } };
  const paleBrand = { colors: ['#fdfdfd'], typography: { primary: null } };
  const unknownFontBrand = { colors: ['#1c7ed6'], typography: { primary: 'Gotham Rounded' } };

  it('stamps presetId as provenance', () => {
    for (const id of CAPTION_PRESET_IDS) {
      expect(applyCaptionPreset(resolveCaptionPreset(id)).presetId).toBe(id);
    }
  });

  it('leaves a non-brand-aware preset untouched by brand colour', () => {
    const pop = resolveCaptionPreset('pop');
    const applied = applyCaptionPreset(pop, brand);
    expect(applied.highlightColor).toBe(pop.style.highlightColor);
    expect(applied.fontFamily).toBe('Anton');
  });

  it('takes brand colour on a brand-aware preset', () => {
    const applied = applyCaptionPreset(resolveCaptionPreset('classic'), brand);
    expect(applied.highlightColor).toBe('#1c7ed6');
  });

  it('refuses a brand primary too pale to read over bright video', () => {
    const applied = applyCaptionPreset(resolveCaptionPreset('classic'), paleBrand);
    expect(applied.highlightColor).toBe(DEFAULT_CAPTION_STYLE.highlightColor);
  });

  it('never sets a brand family with no registered face behind it', () => {
    // The exact silent-Helvetica failure this feature exists to end.
    const applied = applyCaptionPreset(resolveCaptionPreset('classic'), unknownFontBrand);
    expect(applied.fontFamily).toBeUndefined();
  });

  it('does not mutate the catalog', () => {
    const applied = applyCaptionPreset(resolveCaptionPreset('glide'), brand);
    applied.textColor = '#ff0000';
    applied.position!.yFrac = 0.01;
    expect(resolveCaptionPreset('glide').style.textColor).toBe('#ffffff');
    expect(resolveCaptionPreset('glide').style.position?.yFrac).toBe(0.58);
  });
});

describe('brandCaptionFontStatus', () => {
  it('reports an unavailable brand face honestly instead of substituting one', () => {
    expect(
      brandCaptionFontStatus({ colors: [], typography: { primary: 'Gotham Rounded' } }),
    ).toEqual({ family: 'Gotham Rounded', registered: false });
    expect(brandCaptionFontStatus({ colors: [], typography: { primary: 'Inter' } })).toEqual({
      family: 'Inter',
      registered: true,
    });
    expect(brandCaptionFontStatus(null)).toEqual({ family: null, registered: false });
    expect(brandCaptionFontStatus({ colors: [], typography: { primary: '  ' } })).toEqual({
      family: null,
      registered: false,
    });
  });
});

describe('captionFontFamiliesFor', () => {
  it('collects the distinct registrable families a set of styles needs', () => {
    const styles = CAPTION_PRESETS.map((p) => p.style);
    expect(captionFontFamiliesFor(styles).sort()).toEqual([
      'Anton',
      'Inter',
      'JetBrains Mono',
      'Montserrat',
    ]);
  });

  it('drops unregistrable and absent families', () => {
    expect(
      captionFontFamiliesFor([
        undefined,
        { ...DEFAULT_CAPTION_STYLE, fontFamily: 'Gotham Rounded' },
        { ...DEFAULT_CAPTION_STYLE },
      ]),
    ).toEqual([]);
  });
});

describe('grouping is structurally what groupWordsIntoCues takes', () => {
  it('feeds every preset grouping straight into the real cue grouper', () => {
    // The type is declared locally to avoid a module cycle; this is what pins the two.
    const words = Array.from({ length: 24 }, (_, i) => ({
      text: `w${i}`,
      startSec: i * 0.3,
      endSec: i * 0.3 + 0.25,
    }));
    for (const preset of CAPTION_PRESETS) {
      const cues = groupWordsIntoCues(words, preset.grouping);
      expect(cues.length).toBeGreaterThan(0);
      for (const cue of cues) {
        expect(cue.words.length).toBeLessThanOrEqual(preset.grouping.maxWordsPerCue!);
      }
    }
  });

  it('gives pulse the tightest grouping, matching its oversized face', () => {
    expect(resolveCaptionPreset('pulse').grouping.maxWordsPerCue).toBe(3);
  });
});
