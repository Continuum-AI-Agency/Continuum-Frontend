import { z } from 'zod';

/**
 * Where a swapped asset lands, in pixels, before a render is spent.
 *
 * This is a TypeScript port of `template-forge/src/aep/assetFit.js` — deliberately a port and
 * not a call. The forge's copy is the authority and handles rigs this one does not, but it
 * lives behind a CLI on an operator's disk; the canvas needs an answer the moment someone picks
 * a product image, and a round trip per pick is not that. Every exported name here matches the
 * forge's so the two can be diffed by eye when either moves.
 *
 * The whole model is two numbers and a centre. After Effects anchors imported footage at its
 * centre, and a layer's measured box divided by its footage's own pixels is the entire transform
 * chain — parent, scale, rig and all — collapsed into `[sx, sy]`. So a new asset of `w x h`
 * lands at `centre +- (w*sx, h*sy) / 2`, and everything else is set arithmetic against that.
 *
 * What it will NOT do is guess. A slot placed by a controller rig (`Layer to Follow`) is
 * contained in a retainer rectangle this port cannot see, so it returns `unknown` rather than a
 * box — and `unknown` is what escalates the frame to the judge after the render, which is the
 * whole reason the three-valued state exists instead of a boolean.
 */

/** Aspect bounds, measured on the showcase asset set. Byte-identical to the forge's. */
export const SHAPE_BOUNDS = [0.8, 1.25, 2.0] as const;

/** The forge caps growth past native resolution here; a scaled-up photo is a soft photo. */
export const MAX_UPSCALE = 1.05;

export const shapeClassSchema = z.enum(['tall', 'square', 'wide', 'xwide']);
export type ShapeClass = z.infer<typeof shapeClassSchema>;

/** `[x0, y0, x1, y1]` in the comp's own pixels. */
export const pixelBoxSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type PixelBox = z.infer<typeof pixelBoxSchema>;

/**
 * A slot's placement as the parse measured it: the projected box, the footage's own pixel size,
 * and the comp that box belongs to. `source` is null for text and shape layers — they have no
 * footage, so there is nothing to swap and no effective scale to take.
 */
export const slotPlacementSchema = z
  .object({
    comp: z.string().min(1),
    compSize: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    box: pixelBoxSchema,
    boxSource: z.string().nullable().default(null),
    source: z
      .tuple([z.number().int().positive(), z.number().int().positive()])
      .nullable()
      .default(null),
    sourceKind: z.string().nullable().default(null),
    /**
     * The leaf's transform is driven by an expression — a controller rig (`anchorAligment` and
     * friends) that places, and usually fits, whatever asset lands there. `box` is then the
     * SPOT the rig fills, not a rectangle the asset's own pixels would draw, so a swap cannot
     * be predicted from it: the rig does the fitting, and the render is what shows the result.
     */
    rigged: z.boolean().default(false),
  })
  .strict();
export type SlotPlacement = z.infer<typeof slotPlacementSchema>;

export const apiRenderFitStateSchema = z.enum(['ok', 'clipped', 'unknown']);
export type ApiRenderFitState = z.infer<typeof apiRenderFitStateSchema>;

/**
 * WHY a slot came back `unknown` — because the four reasons are not the same problem and
 * collapsing them hid the only one anybody can fix.
 *
 * `rigged` is permanent: a rig fits the asset at render time, so no arithmetic here will ever
 * answer it and the judge is the instrument, forever. `unplaced` and `unsized` are a DATA gap —
 * a template nobody parsed, a layer with no footage size — and re-parsing repairs them.
 * `unpinned` is not a fault at all, just a slot nobody has chosen an asset for yet.
 *
 * Measured on production 2026-09-19: of ten escalated renders, eight were `rigged` (the product
 * image) and two were `unplaced`. Both reported as "could not be measured", so the two
 * repairable ones were invisible inside the eight that never can be.
 */
export const apiRenderFitUnknownReasonSchema = z.enum([
  'rigged',
  'unplaced',
  'unsized',
  'unpinned',
]);
export type ApiRenderFitUnknownReason = z.infer<typeof apiRenderFitUnknownReasonSchema>;

/** The reasons a re-parse would clear. `rigged` is not one of them, and never will be. */
export const REPAIRABLE_FIT_REASONS: readonly ApiRenderFitUnknownReason[] = ['unplaced', 'unsized'];

export const apiRenderFitCoverSchema = z
  .object({ key: z.string(), label: z.string(), coverage: z.number().min(0).max(1) })
  .strict();

export const apiRenderFitVerdictSchema = z
  .object({
    key: z.string(),
    state: apiRenderFitStateSchema,
    shapeClass: shapeClassSchema.nullable().default(null),
    box: pixelBoxSchema.nullable().default(null),
    /** Pixels outside the canvas per edge: left, top, right, bottom. */
    clippedPx: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable().default(null),
    insideFraction: z.number().min(0).max(1).nullable().default(null),
    scale: z.tuple([z.number(), z.number()]).nullable().default(null),
    covers: z.array(apiRenderFitCoverSchema).default([]),
    /** Set only when `state` is `unknown`. Defaulted for rows written before it existed. */
    unknownReason: apiRenderFitUnknownReasonSchema.nullable().default(null),
    why: z.string(),
  })
  .strict();
export type ApiRenderFitVerdict = z.infer<typeof apiRenderFitVerdictSchema>;

export const apiRenderFitReportSchema = z
  .object({
    comp: z
      .object({
        name: z.string(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      })
      .strict()
      .nullable()
      .default(null),
    slots: z.array(apiRenderFitVerdictSchema).default([]),
    /**
     * Whether the finished frame should go to the judge.
     *
     * True when this check could not answer (`unknown`) or answered badly (`clipped`) — the
     * residue. A frame every deterministic gate passed cleanly is not judged, which is what
     * keeps the judge from being a per-render tax on renders nobody had a question about.
     */
    escalate: z.boolean(),
    /**
     * Slot keys whose `unknown` a re-parse would clear — never the rig-placed ones.
     *
     * This is the list worth acting on. Empty means every escalation on this frame is expected,
     * and the judge is doing the job nothing else can.
     */
    repairable: z.array(z.string()).default([]),
    why: z.string(),
  })
  .strict();
export type ApiRenderFitReport = z.infer<typeof apiRenderFitReportSchema>;

// The forge's own three roundings, matched exactly. They are not cosmetic: a caller comparing
// this port's verdict with `forge tools call asset_fit` has to see the same numbers, and a
// fractional clipped pixel is not a thing anyone can act on.
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const whole = (n: number) => Math.round(n);

/** Which sub-version bucket an asset falls in. Null when either dimension is not a real size. */
export function shapeClass(w: number, h: number): ShapeClass | null {
  if (!(w > 0) || !(h > 0)) return null;
  const a = w / h;
  if (a < SHAPE_BOUNDS[0]) return 'tall';
  if (a < SHAPE_BOUNDS[1]) return 'square';
  if (a <= SHAPE_BOUNDS[2]) return 'wide';
  return 'xwide';
}

/**
 * The projected box divided by the source pixels — the whole transform chain as two numbers.
 *
 * Read off the measurement rather than derived from the layer's `scale` property, because a
 * parent transform, a rig and an import-time scale all move the box without touching `scale`.
 */
export function effectiveScale(placement: SlotPlacement): [number, number] | null {
  if (!placement.source) return null;
  const [x0, y0, x1, y1] = placement.box;
  const [sw, sh] = placement.source;
  const sx = (x1 - x0) / sw;
  const sy = (y1 - y0) / sh;
  return Number.isFinite(sx) && Number.isFinite(sy) && sx > 0 && sy > 0 ? [sx, sy] : null;
}

const boxAt = (cx: number, cy: number, w: number, h: number): PixelBox => [
  r2(cx - w / 2),
  r2(cy - h / 2),
  r2(cx + w / 2),
  r2(cy + h / 2),
];

/** `box' = centre +- (w*sx, h*sy) / 2`. Null when the placement carries no effective scale. */
export function predictAssetBox(
  placement: SlotPlacement,
  asset: { w: number; h: number },
): { box: PixelBox; scale: [number, number] } | null {
  if (!(asset.w > 0) || !(asset.h > 0)) return null;
  const scale = effectiveScale(placement);
  if (!scale) return null;
  const [sx, sy] = scale;
  const [x0, y0, x1, y1] = placement.box;
  return {
    box: boxAt((x0 + x1) / 2, (y0 + y1) / 2, asset.w * sx, asset.h * sy),
    scale: [r2(sx * 1000) / 1000, r2(sy * 1000) / 1000],
  };
}

/** Whole pixels outside the canvas per edge: `[left, top, right, bottom]`. Zero where it fits. */
export function clipPx(box: PixelBox, canvas: PixelBox): [number, number, number, number] {
  return [
    whole(Math.max(0, canvas[0] - box[0])),
    whole(Math.max(0, canvas[1] - box[1])),
    whole(Math.max(0, box[2] - canvas[2])),
    whole(Math.max(0, box[3] - canvas[3])),
  ];
}

const area = (b: PixelBox) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

const intersect = (a: PixelBox, b: PixelBox): PixelBox => [
  Math.max(a[0], b[0]),
  Math.max(a[1], b[1]),
  Math.min(a[2], b[2]),
  Math.min(a[3], b[3]),
];

/** How much of `row` the predicted box would cover, 0..1. */
export function coverage(box: PixelBox, row: PixelBox): number {
  const rowArea = area(row);
  if (!(rowArea > 0)) return 0;
  return Math.min(1, area(intersect(box, row)) / rowArea);
}

/** How much of the predicted box lands on the canvas, 0..1. */
export function insideFraction(box: PixelBox, canvas: PixelBox): number {
  const boxArea = area(box);
  if (!(boxArea > 0)) return 0;
  return Math.min(1, area(intersect(box, canvas)) / boxArea);
}

/**
 * One media slot, checked.
 *
 * `neighbours` are the other measured rows in the same comp, so the verdict can say what the
 * asset would cover as well as where it would clip — the two questions the showcase table asks
 * of every swap. Pass none and `covers` is simply empty; it is never inferred.
 */
export function checkAssetSwap(args: {
  key: string;
  placement: SlotPlacement | null;
  asset: { w: number; h: number } | null;
  neighbours?: Array<{ key: string; label: string; box: PixelBox }>;
}): ApiRenderFitVerdict {
  const base = {
    key: args.key,
    unknownReason: null,
    shapeClass: null,
    box: null,
    clippedPx: null,
    insideFraction: null,
    scale: null,
    covers: [],
  };
  if (args.placement?.rigged) {
    // The rig fits the asset into its spot from an expression this port cannot evaluate, so a
    // box drawn from the raw placement would blame the swap for what the rig undoes. Unknown —
    // and the judge, after the render, is what confirms the rig did its job.
    return {
      ...base,
      state: 'unknown',
      unknownReason: 'rigged',
      shapeClass: args.asset ? shapeClass(args.asset.w, args.asset.h) : null,
      box: args.placement.box,
      why: 'placed by a rig in the template, which fits the asset at render time — checked on the finished frame',
    };
  }
  if (!args.asset) {
    return {
      ...base,
      state: 'unknown',
      unknownReason: 'unpinned',
      why: 'no asset is chosen for this slot yet',
    };
  }
  const klass = shapeClass(args.asset.w, args.asset.h);
  if (!args.placement) {
    return {
      ...base,
      state: 'unknown',
      unknownReason: 'unplaced',
      shapeClass: klass,
      // Repairable, unlike a rig: the template simply has no measured placement yet.
      why: 'this template has no measured placement for the slot, so where the asset lands cannot be said — the render will be judged instead',
    };
  }
  const predicted = predictAssetBox(args.placement, args.asset);
  if (!predicted) {
    return {
      ...base,
      state: 'unknown',
      unknownReason: 'unsized',
      shapeClass: klass,
      why: 'the slot has no footage size to take an effective scale from (a text or shape layer, or a rig-placed one)',
    };
  }
  const [cw, ch] = args.placement.compSize;
  const canvas: PixelBox = [0, 0, cw, ch];
  const clipped = clipPx(predicted.box, canvas);
  const inside = r3(insideFraction(predicted.box, canvas));
  const covers = (args.neighbours ?? [])
    .map((row) => ({
      key: row.key,
      label: row.label,
      coverage: r2(coverage(predicted.box, row.box) * 1000) / 1000,
    }))
    .filter((row) => row.coverage > 0)
    .sort((left, right) => right.coverage - left.coverage);
  const clips = clipped.some((edge) => edge > 0);
  return {
    key: args.key,
    state: clips ? 'clipped' : 'ok',
    unknownReason: null,
    shapeClass: klass,
    box: predicted.box,
    clippedPx: clipped,
    insideFraction: inside,
    scale: predicted.scale,
    covers,
    why: clips
      ? `${args.asset.w}x${args.asset.h} at the slot's effective scale clips ${clipped.join('/')} px (l/t/r/b) off the ${cw}x${ch} canvas`
      : `${args.asset.w}x${args.asset.h} at the slot's effective scale lands inside the ${cw}x${ch} canvas`,
  };
}

/**
 * Every media slot on a template, and whether the finished frame needs a judge.
 *
 * The escalation rule is the point of this function: a frame whose every slot came back `ok` is
 * one the deterministic gate already answered, and judging it would buy an opinion we have. A
 * frame with an `unknown` is one nothing has answered. A frame with a `clipped` is one we have
 * an answer for and want confirmed against the pixels the worker actually produced — the
 * prediction is `estimated`, and a keyframed leaf or an off-centre anchor is exactly what makes
 * it wrong.
 */
export function planFitCheck(args: {
  comp: { name: string; width: number; height: number } | null;
  slots: ApiRenderFitVerdict[];
}): ApiRenderFitReport {
  const unknown = args.slots.filter((slot) => slot.state === 'unknown');
  const clipped = args.slots.filter((slot) => slot.state === 'clipped');
  const of = (reason: ApiRenderFitUnknownReason) =>
    unknown.filter((slot) => slot.unknownReason === reason);
  const rigged = of('rigged');
  const repairable = unknown.filter(
    (slot) =>
      slot.unknownReason !== null && REPAIRABLE_FIT_REASONS.includes(slot.unknownReason),
  );
  const unpinned = of('unpinned');
  // A verdict written before `unknownReason` existed carries null; it is still an unknown and
  // still escalates, it just cannot be sorted into a bucket. Counting it as repairable would
  // send someone to re-parse a template that is merely rigged.
  const unclassified = unknown.filter((slot) => slot.unknownReason === null);

  // Unchanged on purpose: what gets judged is a safety property, and this change is about what
  // the report SAYS, not about quietly judging fewer frames.
  const escalate = unknown.length > 0 || clipped.length > 0;

  const plural = (n: number) => (n === 1 ? '' : 's');
  const why = !escalate
    ? args.slots.length === 0
      ? 'this template has no media slots to place'
      : 'every slot lands inside the canvas; the frame does not need a judge'
    : [
        clipped.length ? `${clipped.length} slot${plural(clipped.length)} would clip` : null,
        rigged.length
          ? `${rigged.length} rig-placed slot${plural(rigged.length)} can only be checked on the ` +
            'finished frame (expected, not a fault)'
          : null,
        repairable.length
          ? `${repairable.length} slot${plural(repairable.length)} (${repairable
              .map((slot) => slot.key)
              .join(', ')}) ${repairable.length === 1 ? 'has' : 'have'} no measured placement — ` +
            're-parsing the template would clear this'
          : null,
        unpinned.length
          ? `${unpinned.length} slot${plural(unpinned.length)} ${unpinned.length === 1 ? 'has' : 'have'} no asset pinned`
          : null,
        unclassified.length
          ? `${unclassified.length} slot${plural(unclassified.length)} could not be measured`
          : null,
      ]
        .filter(Boolean)
        .join('; ') + ' — the finished frame goes to the judge';

  return {
    comp: args.comp,
    slots: args.slots,
    escalate,
    repairable: repairable.map((slot) => slot.key),
    why,
  };
}
