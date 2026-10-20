import {
  type HyperframesNativeEdits,
  type HyperframesSceneView,
  type SaveHyperframesRevisionRequest,
  saveHyperframesRevisionRequestSchema,
  type TemplateRevisionVariant,
} from '@continuum/contracts';
import { z } from 'zod';

export const nativeEditorFormSchema = z
  .object({
    target: z.enum(['new', 'current']),
    name: z.string().trim().max(120),
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
    texts: z
      .array(z.object({ fieldId: z.string().min(1), value: z.string().max(65_536) }))
      .max(160_000),
  })
  .superRefine((value, context) => {
    if (value.width * value.height > 8_388_608)
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'Choose a size of at most 8,388,608 pixels.',
      });
    if (value.target === 'new' && !value.name)
      context.addIssue({ code: 'custom', path: ['name'], message: 'Name this variant.' });
  });
export type NativeEditorForm = z.infer<typeof nativeEditorFormSchema>;

/** A missing full value is read-only, rather than an empty edit that erases the source copy. */
export function nativeTextFields(view: HyperframesSceneView) {
  return view.capabilities.flatMap((capability) =>
    capability.operation === 'text' &&
    capability.state === 'editable' &&
    capability.fieldId &&
    capability.text
      ? [
          {
            fieldId: capability.fieldId,
            value: capability.text.value,
            reveal: capability.text.reveal,
          },
        ]
      : [],
  );
}

export function nativeEditorDefaults(
  view: HyperframesSceneView,
  variant?: TemplateRevisionVariant,
): NativeEditorForm {
  return {
    target:
      variant && !variant.original && variant.draftHeadRevisionId === view.revision.revisionId
        ? 'current'
        : 'new',
    name: `${variant?.name ?? 'Native'} copy`.slice(0, 120),
    ...view.viewport,
    texts: nativeTextFields(view).map(({ fieldId, value }) => ({ fieldId, value })),
  };
}

/** Edits are complete snapshots. Preserve operations this inspector does not expose. */
export function nativeEditorEdits(
  view: HyperframesSceneView,
  input: NativeEditorForm,
): HyperframesNativeEdits {
  const form = nativeEditorFormSchema.parse(input);
  const fields = new Map(nativeTextFields(view).map((field) => [field.fieldId, field.value]));
  if (
    form.texts.length !== fields.size ||
    new Set(form.texts.map((field) => field.fieldId)).size !== fields.size ||
    form.texts.some((field) => !fields.has(field.fieldId))
  )
    throw Error('The editable fields changed. Reopen this saved revision.');
  const replacements = new Map(
    form.texts
      .filter((field) => field.value !== fields.get(field.fieldId))
      .map((field) => [field.fieldId, field.value]),
  );
  const resized = form.width !== view.viewport.width || form.height !== view.viewport.height;
  const operations = structuredClone(view.edits.operations).filter(
    (op) =>
      !(op.op === 'text' && replacements.has(op.fieldId)) && !(op.op === 'viewport' && resized),
  );
  for (const [fieldId, value] of replacements) operations.push({ op: 'text', fieldId, value });
  if (resized) operations.push({ op: 'viewport', width: form.width, height: form.height });
  if (operations.length > 1000)
    throw Error('A saved revision supports at most 1,000 combined edit operations.');
  return { ...view.edits, operations };
}

export function nativeSaveRequest(
  view: HyperframesSceneView,
  variant: TemplateRevisionVariant | undefined,
  input: NativeEditorForm,
  idempotencyKey: string,
): SaveHyperframesRevisionRequest {
  if (!view.sourceSceneSha256)
    throw Error('This revision uses an older upload. Reopen its source before saving.');
  const form = nativeEditorFormSchema.parse(input);
  if (
    form.target === 'current' &&
    (!variant ||
      variant.original ||
      variant.templateId !== view.assetId ||
      variant.variantId !== view.revision.variantId ||
      variant.draftHeadRevisionId !== view.revision.revisionId)
  )
    throw Error('This revision is no longer the variant head. Save a new variant.');
  return saveHyperframesRevisionRequestSchema.parse({
    family: 'hyperframes',
    brandId: view.brandId,
    parentRevisionId: view.revision.revisionId,
    expectedParentSceneSha256: view.sceneSha256,
    expectedSourceSceneSha256: view.sourceSceneSha256,
    ...(form.target === 'current' ? { variantId: view.revision.variantId } : { name: form.name }),
    expectedHeadRevisionId: form.target === 'current' ? view.revision.revisionId : null,
    idempotencyKey,
    edits: nativeEditorEdits(view, form),
  });
}

export function nativeEditorHref(
  brandId: string,
  assetId: string,
  revisionId?: string,
  jobId?: string,
) {
  const query = new URLSearchParams({
    brandId,
    ...(revisionId ? { revisionId } : {}),
    ...(jobId ? { jobId } : {}),
  });
  return `/forge/native/${encodeURIComponent(assetId)}?${query}`;
}
