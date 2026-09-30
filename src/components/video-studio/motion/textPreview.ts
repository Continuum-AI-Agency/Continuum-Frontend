// Text previews drawn by the caption renderer the export burns in (drawActiveCaption, and
// the animation ids resolved by captionAnimationFromEditorId), so a template card or an
// animation tile shows what renders — never a CSS look-alike that drifts from it.

import {
  TEXT_ANIMATION_IDS,
  TEXT_TEMPLATES,
  type TextAnimationId,
  type TextTemplateId,
  type TextTemplateLayer,
} from '@continuum/contracts';
import { captionAnimationFromEditorId } from '@/lib/clips/captionAnimation';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { type CaptionCue, wordsForCaptionText } from '@/StudioCanvas/utils/splice/captionCues';
import { drawActiveCaption } from '@/StudioCanvas/utils/splice/drawCaptions';

export type PreviewLayer = { cue: CaptionCue; style: CaptionStyle };
export type TemplateLines = { text: string; secondaryText?: string };

/** What a card says before anyone types: a line that shows off the template's job. */
export const TEMPLATE_SAMPLES: Record<TextTemplateId, Required<TemplateLines>> = {
  hook_title: { text: 'Stop scrolling', secondaryText: '' },
  lower_third: { text: 'Alex Rivera', secondaryText: 'Head coach' },
  kinetic_words: { text: 'Every word lands', secondaryText: '' },
  cta_end_card: { text: 'Book your day pass', secondaryText: 'Link in bio' },
  listicle_number: { text: '1', secondaryText: 'Start with the why' },
  quote: { text: '“It changed everything”', secondaryText: 'Maya, member' },
  stat_callout: { text: '3×', secondaryText: 'faster edits' },
  subtitle_bar: { text: 'One line says it all', secondaryText: '' },
};

/** Whether a template has a second line to fill. */
export const takesSecondLine = (templateId: TextTemplateId): boolean =>
  TEXT_TEMPLATES[templateId].layers.some((layer) => layer.role === 'secondary');

/** The lines a placement sends: typed text, else the sample; a second line only where one fits. */
export function templateLines(templateId: TextTemplateId, typed: TemplateLines): TemplateLines {
  const sample = TEMPLATE_SAMPLES[templateId];
  const text = typed.text.trim() || sample.text;
  if (!takesSecondLine(templateId)) return { text };
  const secondaryText = typed.secondaryText?.trim() || sample.secondaryText;
  return secondaryText ? { text, secondaryText } : { text };
}

/** What add_text writes: an outline of 6 % of the size, and none on a boxed line. */
const OUTLINE_FRAC = 0.06;
const TEXT_FONT = 'Inter';

function layerStyle(layer: TextTemplateLayer): CaptionStyle {
  return {
    textColor: layer.color,
    // A text clip has no spoken word; the export paints every word in its own colour.
    highlightColor: layer.color,
    outlineColor: '#000000',
    outlineWidthFrac: layer.outline && !layer.backgroundColor ? OUTLINE_FRAC : 0,
    fontFamily: TEXT_FONT,
    fontWeight: layer.fontWeight,
    fontSizeFrac: layer.sizeFrac,
    uppercase: layer.uppercase === true,
    position: { xFrac: layer.x, yFrac: layer.y },
    ...(layer.backgroundColor
      ? { backgroundColor: layer.backgroundColor, backgroundOpacity: 1 }
      : {}),
    animation: captionAnimationFromEditorId(layer.animationIn),
    exitAnimation: captionAnimationFromEditorId(layer.animationOut),
  };
}

/** A template's layers as cues on its own clock, each starting after its delay. */
export function templatePreviewLayers(
  templateId: TextTemplateId,
  lines: TemplateLines,
): PreviewLayer[] {
  const template = TEXT_TEMPLATES[templateId];
  const endSec = template.defaultDurationSec;
  return template.layers.flatMap((layer, index): PreviewLayer[] => {
    const text = layer.role === 'primary' ? lines.text : lines.secondaryText;
    if (!text?.trim()) return [];
    const startSec = Math.min(layer.delaySec, endSec - 0.1);
    return [
      {
        cue: {
          id: `${templateId}-${index}`,
          startSec,
          endSec,
          words: wordsForCaptionText(text, startSec, endSec),
        },
        style: layerStyle(layer),
      },
    ];
  });
}

export const ANIMATION_PREVIEW_SEC = 1.2;

/** One word animating in (or out) through the same resolver the export uses. */
export function animationPreviewLayer(id: TextAnimationId, phase: 'in' | 'out'): PreviewLayer {
  const animation = captionAnimationFromEditorId(id);
  return {
    cue: {
      id: `animation-${phase}-${id}`,
      startSec: 0,
      endSec: ANIMATION_PREVIEW_SEC,
      words: wordsForCaptionText('Aa', 0, ANIMATION_PREVIEW_SEC),
    },
    style: {
      textColor: '#ffffff',
      highlightColor: '#ffffff',
      outlineColor: '#000000',
      outlineWidthFrac: OUTLINE_FRAC,
      fontWeight: 800,
      fontSizeFrac: 0.4,
      position: { xFrac: 0.5, yFrac: 0.55 },
      ...(phase === 'in' ? { animation } : { exitAnimation: animation }),
    },
  };
}

const squash = (id: string): string => id.replace(/[-_\s]/g, '').toLowerCase();

/** Stored ids come hyphenated (`scale-in`) or camel (`scaleIn`); read either as the contract id. */
export const animationIdFor = (stored: string | undefined): TextAnimationId =>
  TEXT_ANIMATION_IDS.find((id) => squash(id) === squash(stored ?? 'none')) ?? 'none';

/** One frame: a neutral ground, then every layer live at `timeSec`. */
export function drawPreviewFrame(
  context: CanvasRenderingContext2D,
  layers: readonly PreviewLayer[],
  timeSec: number,
  width: number,
  height: number,
): void {
  const ground = context.createLinearGradient(0, 0, 0, height);
  ground.addColorStop(0, '#3a3f4b');
  ground.addColorStop(1, '#16181d');
  context.fillStyle = ground;
  context.fillRect(0, 0, width, height);
  for (const { cue, style } of layers) {
    if (timeSec < cue.startSec || timeSec >= cue.endSec) continue;
    // The renderer is typed for the worker's OffscreenCanvas; the DOM context draws the same.
    drawActiveCaption(
      context as unknown as OffscreenCanvasRenderingContext2D,
      cue,
      timeSec,
      width,
      height,
      style,
    );
  }
}
