import { z } from 'zod';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uid = z.number().int().positive();
export const templateAuthoringDependencyRelinkRequestSchema = z.object({
  schema: z.literal('forge_template_authoring_dependency_relink/v1'),
  filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: hash,
  inlineBase64: z.string().min(1),
  asset: z.object({ filename: z.string().min(1).max(180), sha256: hash, inlineBase64: z.string().min(1) }).strict(),
  operation: z.object({ type: z.literal('dependency.relink'), footageItemId: uid, expectedFile: z.string().min(1).max(4096) }).strict(),
}).strict();
export type TemplateAuthoringDependencyRelinkRequest = z.infer<typeof templateAuthoringDependencyRelinkRequestSchema>;

export const templateAuthoringDependencyRelinkResponseSchema = z.object({
  filename: z.string().min(1), sourceSha256: hash, outputSha256: hash, inlineBase64: z.string().min(1),
  receipt: z.object({ ok: z.literal(true), footageItemId: uid, originalFile: z.string().min(1), relativeFile: z.string().min(1),
    width: uid, height: uid, assetSha256: hash, layerPayloadsPreserved: z.literal(true), otherFootagePayloadsPreserved: z.literal(true) }).strict(),
  affectedLayers: z.array(z.object({ compId: uid, layerUid: uid }).strict()),
  proof: z.object({ onlySelectedAliasChanged: z.literal(true), existingDependenciesPreserved: z.literal(true), sourcePackageUnchanged: z.literal(true) }).strict(),
}).strict();
export type TemplateAuthoringDependencyRelinkResponse = z.infer<typeof templateAuthoringDependencyRelinkResponseSchema>;
