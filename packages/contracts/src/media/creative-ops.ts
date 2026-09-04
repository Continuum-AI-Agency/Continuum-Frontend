/**
 * A creative-ops recipe — an ordered run of Canvas action-catalog operations that a
 * headless caller (Jaina ad creation, the Organic agent, a scheduled automation) can
 * ask for without a canvas graph.
 *
 * The knobs are NOT here. Every step's `config` is validated against
 * `actionDef(actionId).config` from `../ai-studio/action-registry`, which is the one
 * place an op's config shape is allowed to be declared. A second copy of "how blurry"
 * is exactly the drift the registry was built to end.
 *
 * A recipe is a straight line, not a graph: step N may read the output of any EARLIER
 * step or a library asset, and the last step's output is the result. Everything the
 * canvas can express beyond that (fan-out, batch, routers) belongs on the canvas.
 */

import { z } from 'zod';

import {
  ACTION_DEFS,
  ACTION_IDS,
  type ActionDef,
  type ActionId,
  type ActionModality,
  actionDef,
  actionInputPort,
} from '../ai-studio/action-registry';
import { databaseUuidSchema } from './database-uuid';

/** Long enough for "matte, pad, grade, headline, logo"; short enough to stay a line. */
export const CREATIVE_OPS_MAX_STEPS = 12;

/**
 * Where one input port reads from: the Library, an earlier step, or a literal.
 *
 * `text` is the canvas `string` node's stand-in. Without it `image.text` — the whole
 * reason a headless caller wants this catalog — has no way to be told the headline.
 */
export const creativeOpInputRefSchema = z.union([
  z.object({ assetId: databaseUuidSchema }).strict(),
  z.object({ step: z.number().int().nonnegative() }).strict(),
  z.object({ text: z.string().min(1).max(5_000) }).strict(),
]);
export type CreativeOpInputRef = z.infer<typeof creativeOpInputRefSchema>;

export const creativeOpInputSchema = z
  .object({
    handle: z.string().min(1).max(40),
    from: creativeOpInputRefSchema,
  })
  .strict();
export type CreativeOpInput = z.infer<typeof creativeOpInputSchema>;

export const creativeOpStepSchema = z
  .object({
    actionId: z.enum(ACTION_IDS),
    /** Raw `node.data.config` for the op. Parsed against the op's own schema below. */
    config: z.record(z.string(), z.unknown()).default({}),
    inputs: z.array(creativeOpInputSchema).min(1).max(10),
  })
  .strict();
export type CreativeOpStep = z.infer<typeof creativeOpStepSchema>;

/**
 * The recipe, with every cross-step rule the runner would otherwise discover halfway
 * through a paid render. A refusal here costs nothing; a refusal at step 4 has already
 * spent three encodes.
 */
export const creativeOpsRecipeSchema = z
  .array(creativeOpStepSchema)
  .min(1)
  .max(CREATIVE_OPS_MAX_STEPS)
  .superRefine((steps, context) => {
    steps.forEach((step, index) => {
      const def: ActionDef = ACTION_DEFS[step.actionId];

      if (def.comingSoon) {
        context.addIssue({
          code: 'custom',
          path: [index, 'actionId'],
          message: `${step.actionId} is not runnable yet: ${def.comingSoon}`,
        });
      }

      const config = def.config.safeParse(step.config);
      if (!config.success) {
        context.addIssue({
          code: 'custom',
          path: [index, 'config'],
          message: `${step.actionId} config is invalid: ${config.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
            .join('; ')}`,
        });
      }

      // A fan-out op emits N items. The canvas loops the graph downstream of one; a
      // recipe is a line and has nothing to loop, so it may only ever be the last step.
      // Refusing here beats feeding "which of the 40 frames?" into step N+1 at runtime.
      if (def.outputsCollection && index !== steps.length - 1) {
        context.addIssue({
          code: 'custom',
          path: [index, 'actionId'],
          message: `${step.actionId} emits a collection, so it can only be the last step of a recipe.`,
        });
      }

      // Background removal is a GPU service the Backend calls, not a pixel op — on
      // BOTH lanes it needs a library asset id, because that is what it mattes and
      // what it registers the cutout against. A step output has no id to give it.
      if (isServerNativeCreativeOp(step.actionId)) {
        const source = step.inputs.find((entry) => entry.handle === 'in')?.from;
        if (source && !('assetId' in source)) {
          context.addIssue({
            code: 'custom',
            path: [index, 'inputs'],
            message: `${step.actionId} must read a library asset directly; it cannot matte another step's output.`,
          });
        }
      }

      const perHandle = new Map<string, number>();
      step.inputs.forEach((input, inputIndex) => {
        const port = actionInputPort(step.actionId, input.handle);
        if (!port) {
          context.addIssue({
            code: 'custom',
            path: [index, 'inputs', inputIndex, 'handle'],
            message: `${step.actionId} has no "${input.handle}" input. It takes: ${
              def.inputs.map((entry) => entry.handle).join(', ') || 'nothing'
            }.`,
          });
          return;
        }

        const used = (perHandle.get(input.handle) ?? 0) + 1;
        perHandle.set(input.handle, used);
        if (used > port.max) {
          context.addIssue({
            code: 'custom',
            path: [index, 'inputs', inputIndex],
            message: `${step.actionId} takes at most ${port.max} input(s) on "${input.handle}".`,
          });
        }

        if ('text' in input.from && port.modality !== 'text') {
          context.addIssue({
            code: 'custom',
            path: [index, 'inputs', inputIndex, 'from'],
            message: `${step.actionId}'s "${input.handle}" takes ${port.modality}, not a literal string.`,
          });
        }

        if ('assetId' in input.from && port.modality === 'text') {
          context.addIssue({
            code: 'custom',
            path: [index, 'inputs', inputIndex, 'from'],
            message: `${step.actionId}'s "${input.handle}" takes text; pass { text: "..." } rather than an asset.`,
          });
        }

        if ('step' in input.from) {
          if (input.from.step >= index) {
            context.addIssue({
              code: 'custom',
              path: [index, 'inputs', inputIndex, 'from', 'step'],
              message: `Step ${index} can only read steps before it; ${input.from.step} is not one.`,
            });
            return;
          }
          const produced = ACTION_DEFS[steps[input.from.step].actionId].output;
          if (produced !== port.modality) {
            context.addIssue({
              code: 'custom',
              path: [index, 'inputs', inputIndex, 'from', 'step'],
              message: `Step ${input.from.step} produces ${produced}, but ${step.actionId}'s "${input.handle}" takes ${port.modality}.`,
            });
          }
        }
      });
    });

    // A recipe exists to produce media. A trailing text op leaves nothing to register,
    // and a caller who wanted a string never needed the render lanes at all. Text ops
    // are still legal mid-recipe, which is the point of `text.concat -> image.text`.
    const last = steps[steps.length - 1];
    if (last && ACTION_DEFS[last.actionId].output === 'text') {
      context.addIssue({
        code: 'custom',
        path: [steps.length - 1, 'actionId'],
        message: `A recipe must end in an image or a video; ${last.actionId} produces text.`,
      });
    }
  });
export type CreativeOpsRecipe = z.infer<typeof creativeOpsRecipeSchema>;

/**
 * Every library asset the recipe reads, in first-reference order.
 *
 * This is the LINEAGE, which is why it is derived rather than declared: an overlay has
 * two parents and a stitch has several, so a single `sourceAssetId` field would quietly
 * drop all but one of them from the registered result's provenance.
 */
export const creativeOpsSourceAssetIds = (recipe: CreativeOpsRecipe): string[] => {
  const seen: string[] = [];
  for (const step of recipe) {
    for (const input of step.inputs) {
      if ('assetId' in input.from && !seen.includes(input.from.assetId)) {
        seen.push(input.from.assetId);
      }
    }
  }
  return seen;
};

/** What the recipe hands back. `text` is unreachable — the schema refuses it. */
export const creativeOpsOutputModality = (recipe: CreativeOpsRecipe): ActionModality =>
  ACTION_DEFS[recipe[recipe.length - 1].actionId].output;

/** True when any step re-encodes video, which is what makes a run expensive. */
export const creativeOpsTouchesVideo = (recipe: CreativeOpsRecipe): boolean =>
  recipe.some((step) => ACTION_DEFS[step.actionId].execution === 'worker');

/**
 * Background removal is the one op that already runs headlessly — it is a GPU service
 * the Backend calls directly. The runner splits these out rather than sending them
 * through a browser that would have to carry a user credential to reach the route.
 */
export const CREATIVE_OPS_SERVER_NATIVE_ACTIONS = [
  'image.removeBackground',
  'video.removeBackground',
] as const satisfies readonly ActionId[];

export const isServerNativeCreativeOp = (id: unknown): boolean =>
  (CREATIVE_OPS_SERVER_NATIVE_ACTIONS as readonly string[]).includes(String(id));

/** Which lane a caller wants. `auto` tries the user's browser, then the render service. */
export const creativeOpsLanePreferenceSchema = z.enum(['auto', 'client', 'server']);
export type CreativeOpsLanePreference = z.infer<typeof creativeOpsLanePreferenceSchema>;

/** The op vocabulary an agent is shown, rendered from the registry so it cannot drift. */
export const describeCreativeOps = (): string =>
  ACTION_IDS.map((id) => {
    const def = actionDef(id);
    if (!def) return id;
    const ports = def.inputs.map((port) => `${port.handle}:${port.modality}`).join(', ');
    const suffix = def.comingSoon ? ' [not runnable yet]' : '';
    return `${id} (${ports || 'no inputs'}) -> ${def.output}: ${def.description}${suffix}`;
  }).join('\n');
