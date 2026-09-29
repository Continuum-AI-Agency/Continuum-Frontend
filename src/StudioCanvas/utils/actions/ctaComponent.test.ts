import { describe, expect, it } from 'bun:test';
import { ACTION_DEFS, CTA_COMPONENT_EM, VERNE_TITLE_BOLD_SIZE } from '@continuum/contracts';
import { ctaEmPx, ctaSvg, readCtaSettings } from './ctaComponent';
import { shippedFaces } from './imageText';

const frame = { width: 1080, height: 1350 };
const settingsFor = (config: Record<string, unknown>) =>
  readCtaSettings(ACTION_DEFS['image.cta'].config.parse(config) as Record<string, unknown>);

describe('image.cta', () => {
  it('sets the reference size when the component fits, and shrinks it to maxWidth when not', () => {
    const settings = settingsFor({ maxWidth: 0.5 });
    const reference = VERNE_TITLE_BOLD_SIZE * frame.width;
    expect(ctaEmPx(settings, frame, () => 10)).toBe(reference);
    const em = ctaEmPx(settings, frame, (px) => px * 12);
    const box = CTA_COMPONENT_EM.button;
    expect(em * (12 + 2 * box.padX + box.trail)).toBeCloseTo(0.5 * frame.width, 6);
  });

  it('draws exactly the words it was given, accents and markup-significant characters intact', () => {
    const text = '¡Pídela aquí! ¿Mañana? Ú & <más>';
    for (const component of ['button', 'sticker', 'endline'] as const) {
      const svg = ctaSvg({
        text,
        settings: settingsFor({ component, fillHex: '#ea8301' }),
        faces: shippedFaces('Montserrat'),
        emPx: 40,
        frame,
        fontFaceCss: null,
      });
      expect(svg).toContain('¡Pídela aquí! ¿Mañana? Ú &amp; &lt;más&gt;');
      expect(svg).toContain('<foreignObject');
    }
  });

  it('sets a long offer on two balanced lines, broken where the planner breaks it', () => {
    const svg = ctaSvg({
      text: '¡Pídela ya, está fría!',
      settings: settingsFor({ twoLines: true }),
      faces: shippedFaces('Montserrat'),
      emPx: 40,
      frame,
      fontFaceCss: null,
    });
    expect(svg).toContain('¡Pídela ya,<br/>está fría!');
    expect(svg).toContain('border-radius:0.8em');
  });

  it('pins the component to the anchor edge, the margin in from it', () => {
    const svg = ctaSvg({
      text: 'Solicita tu DayPass',
      settings: settingsFor({ anchor: 'bottom-right', marginFrac: 0.07 }),
      faces: shippedFaces('Montserrat'),
      emPx: 40,
      frame,
      fontFaceCss: null,
    });
    expect(svg).toContain(`right:${0.07 * frame.width}px`);
    expect(svg).toContain(`bottom:${0.07 * frame.height}px`);
  });
});
