import { z } from 'zod';
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const names = z.array(z.string().min(1).max(200)).max(200);
export const templatePackageFontsRequestSchema = z.object({
  schema: z.literal('forge_template_package_fonts/v1'), filename: z.string().regex(/^.{1,180}\.(aep|zip)$/i),
  sourceSha256: sha256, inlineBase64: z.string().min(1), names,
}).strict();
export const templatePackageFontsResponseSchema = z.object({
  sourceSha256: sha256,
  files: z.array(z.object({filename:z.string().regex(/^[a-f0-9]{64}\.(ttf|otf)$/),postScriptName:z.string().min(1),sha256,sizeBytes:z.number().int().positive().max(20*1024*1024),inlineBase64:z.string().min(1),requestedNames:z.tuple([z.string().min(1).max(200)])}).strict()).max(200),
  missing: names, ambiguous: names,
}).strict();
export type TemplatePackageFontsRequest = z.infer<typeof templatePackageFontsRequestSchema>;
export type TemplatePackageFontsResponse = z.infer<typeof templatePackageFontsResponseSchema>;
