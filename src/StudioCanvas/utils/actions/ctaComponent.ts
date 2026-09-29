// `image.cta` — a call to action as a designed component, not a plate behind a line of text.
//
// The component is HTML/CSS inside an SVG `<foreignObject>`, rasterised by the page as an image.
// The canvas and Render's Chrome lane run this same function, so both draw the same pixels. An
// SVG drawn as an image runs no script and loads nothing, so the face travels inside it as the
// same `@font-face` data URI `image.text` embeds, and the arrows are paths rather than glyphs a
// face might not carry.
//
// The words are whatever arrived on `text-in` — the request's copy. This module holds no copy.

import {
  anchorAxes,
  type BrandTypeInputs,
  type BurnInAnchor,
  CTA_COMPONENT_EM,
  CTA_LINE_EM,
  type CtaComponent,
  ctaLines,
  type Rgb,
  type Size,
  VERNE_TITLE_BOLD_SIZE,
} from '@continuum/contracts';
import type { DrawableImage } from './imageOps';
import {
  drawSvg,
  embedFace,
  escapeXml,
  type HeadlineFaces,
  parseHexColour,
  plateFill,
  resolveHeadlineFaces,
  rgbToHex,
  shippedFaces,
} from './imageText';

export interface CtaSettings {
  readonly component: CtaComponent;
  readonly anchor: BurnInAnchor;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly marginFrac: number;
  readonly scale: number;
  readonly maxWidth: number;
  readonly lines: 1 | 2;
  readonly fill: Rgb;
  readonly ink: Rgb;
  readonly family: string | null;
}

const NEAR_BLACK: Rgb = [17, 17, 17];

/** `ctaComponentConfig`, already parsed by `parseActionConfig`, read as the shape it is. */
export function readCtaSettings(config: Record<string, unknown>): CtaSettings {
  const fill = parseHexColour(String(config.fillHex ?? '')) ?? NEAR_BLACK;
  return {
    component: config.component as CtaComponent,
    anchor: config.anchor as BurnInAnchor,
    offsetX: config.offsetX as number,
    offsetY: config.offsetY as number,
    marginFrac: config.marginFrac as number,
    scale: config.scale as number,
    maxWidth: config.maxWidth as number,
    lines: config.twoLines === true ? 2 : 1,
    fill,
    ink: parseHexColour(String(config.inkHex ?? '')) ?? plateFill(fill),
    family: typeof config.family === 'string' ? config.family : null,
  };
}

/**
 * The type's size in px: the reference bold at `scale`, shrunk until the whole component —
 * words, padding and its trailing mark — fits `maxWidth` of the frame.
 */
export function ctaEmPx(
  settings: Pick<CtaSettings, 'component' | 'scale' | 'maxWidth'>,
  frame: Size,
  wordsWidthAt: (emPx: number) => number,
): number {
  const box = CTA_COMPONENT_EM[settings.component];
  const em = VERNE_TITLE_BOLD_SIZE * settings.scale * frame.width;
  const width = wordsWidthAt(em) + em * (2 * box.padX + box.trail);
  const limit = settings.maxWidth * frame.width;
  return width > limit ? (em * limit) / width : em;
}

const mix = (rgb: Rgb, toward: Rgb, amount: number): string => {
  const at = (channel: 0 | 1 | 2) =>
    Math.round(rgb[channel] + (toward[channel] - rgb[channel]) * amount);
  return rgbToHex([at(0), at(1), at(2)]);
};

/** The arrow as a path in `stroke`, sized in ems of the type around it. */
const arrow = (stroke: string, sizeEm: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${sizeEm}em" height="${sizeEm}em" style="display:block">` +
  `<path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Where the component sits: its outer edge `marginFrac` in from the anchor's edges. */
function position(settings: CtaSettings, frame: Size): { place: string; shift: string } {
  const { row, column } = anchorAxes(settings.anchor);
  const dx = settings.offsetX * frame.width;
  const dy = settings.offsetY * frame.height;
  const mx = settings.marginFrac * frame.width;
  const my = settings.marginFrac * frame.height;
  const x =
    column === 'left'
      ? `left:${mx + dx}px`
      : column === 'right'
        ? `right:${mx - dx}px`
        : `left:${frame.width / 2 + dx}px`;
  const y =
    row === 'top'
      ? `top:${my + dy}px`
      : row === 'bottom'
        ? `bottom:${my - dy}px`
        : `top:${frame.height / 2 + dy}px`;
  return {
    place: `position:absolute;${x};${y};`,
    shift: `translate(${column === 'center' ? '-50%' : '0'},${row === 'center' ? '-50%' : '0'})`,
  };
}

/** The component as its markup: a button with depth, an offer sticker, or an end line. */
function componentHtml(text: string, settings: CtaSettings, faces: HeadlineFaces, emPx: number) {
  const box = CTA_COMPONENT_EM[settings.component];
  const fill = rgbToHex(settings.fill);
  const ink = rgbToHex(settings.ink);
  // Two lines centre on a button or sticker; an end line keeps to the edge it is anchored to.
  const { column } = anchorAxes(settings.anchor);
  const align =
    settings.component === 'endline' && column !== 'center'
      ? column === 'left'
        ? 'left'
        : 'right'
      : 'center';
  const words = `<span style="text-align:${align}">${ctaLines(text, settings.lines)
    .map(escapeXml)
    .join('<br/>')}</span>`;
  const type =
    `font-family:${escapeXml(faces.stack)};font-weight:${faces.boldWeight};font-size:${emPx}px;` +
    `line-height:${CTA_LINE_EM};white-space:nowrap;font-kerning:normal;`;
  switch (settings.component) {
    case 'button':
      // The words on the flat face, so their contrast is exactly ink on fill. The depth is all
      // outside them: a darker lip under the face, a soft drop shadow, a hairline of light on top.
      return {
        style:
          `${type}display:flex;align-items:center;gap:0.55em;` +
          `padding:${box.padY}em ${box.padX * 0.6}em ${box.padY}em ${box.padX * 1.4}em;` +
          `border-radius:${settings.lines === 2 ? '0.8em' : '999px'};background:${fill};color:${ink};` +
          `box-shadow:0 0.12em 0 ${mix(settings.fill, [0, 0, 0], 0.38)},0 0.55em 1.1em -0.25em rgba(0,0,0,0.5),inset 0 0.05em 0 rgba(255,255,255,0.3);`,
        inner:
          words +
          `<span style="display:flex;align-items:center;justify-content:center;width:1.1em;height:1.1em;border-radius:50%;background:${ink}">${arrow(fill, 0.7)}</span>`,
        tilt: '',
      };
    case 'sticker':
      // A die-cut badge: the fill inside a white edge, set on a slight tilt, lifted by a shadow.
      return {
        style:
          `${type}padding:${box.padY}em ${box.padX}em;border-radius:0.4em;background:${fill};color:${ink};` +
          'box-shadow:0 0 0 0.13em #ffffff,0 0.45em 0.9em -0.15em rgba(0,0,0,0.45);',
        inner: words,
        tilt: ' rotate(-4deg)',
      };
    case 'endline':
      // Editorial: the words straight on the photo over a rule in the fill, closed by an arrow.
      return {
        style:
          `${type}display:flex;align-items:center;gap:0.45em;color:${ink};` +
          `padding-bottom:${box.padY}em;border-bottom:0.08em solid ${fill};`,
        inner: words + arrow(ink, 0.8),
        tilt: '',
      };
  }
}

/** The whole frame as an SVG with the component laid out in it by the page's own CSS engine. */
export function ctaSvg(args: {
  text: string;
  settings: CtaSettings;
  faces: HeadlineFaces;
  emPx: number;
  frame: Size;
  fontFaceCss: string | null;
}): string {
  const { width, height } = args.frame;
  const { place, shift } = position(args.settings, args.frame);
  const component = componentHtml(args.text, args.settings, args.faces, args.emPx);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    (args.fontFaceCss
      ? `<defs><style type="text/css">${escapeXml(args.fontFaceCss)}</style></defs>`
      : '') +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${width}px;height:${height}px;margin:0">` +
    `<div style="${place}transform:${shift}${component.tilt};${component.style}">${component.inner}</div>` +
    '</div></foreignObject></svg>'
  );
}

/** The `SYNC_OPS` adapter: resolve the face, fit the component, draw it over the still. */
export async function setImageCta(args: {
  brand: BrandTypeInputs | null | undefined;
  config: Record<string, unknown>;
  image: DrawableImage;
  text: string;
}): Promise<OffscreenCanvas> {
  const text = args.text.trim();
  if (!text) throw new Error('Nothing is connected to this action\'s "text-in" input');
  const settings = readCtaSettings(args.config);
  const faces = settings.family
    ? shippedFaces(settings.family)
    : resolveHeadlineFaces(args.brand ?? {});
  // Registered before the measure, embedded in the SVG for the draw: one face on both sides.
  const fontFaceCss = await embedFace(faces.family);
  const frame: Size = { width: args.image.width, height: args.image.height };
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a 2D canvas context');
  const emPx = ctaEmPx(settings, frame, (em) => {
    ctx.font = `${faces.boldWeight} ${em}px ${faces.stack}`;
    return Math.max(...ctaLines(text, settings.lines).map((line) => ctx.measureText(line).width));
  });
  ctx.drawImage(args.image, 0, 0, frame.width, frame.height);
  await drawSvg(ctx, ctaSvg({ text, settings, faces, emPx, frame, fontFaceCss }), frame);
  return canvas;
}
