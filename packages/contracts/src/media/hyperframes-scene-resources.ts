import { z } from 'zod';
import {
  hyperframesDependencySchema,
  type HyperframesScene,
  type HyperframesSceneRef,
} from './hyperframes-native';

/** One immutable private object per content hash, independent of URL aliases. */
export const hyperframesSceneResourceSchema = hyperframesDependencySchema
  .omit({ source: true, redirect: true })
  .extend({
    byteLength: z
      .number()
      .int()
      .nonnegative()
      .max(18 << 20),
    bucket: z.literal('media-library'),
    storagePath: z.string().min(1).max(4096),
  })
  .strict();
export type HyperframesSceneResource = z.infer<typeof hyperframesSceneResourceSchema>;
export const hyperframesSceneResourcesSchema = z
  .object({
    schema: z.literal('hyperframes.scene-resources/1'),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sceneSha256: z.string().regex(/^[a-f0-9]{64}$/),
    resources: z.array(hyperframesSceneResourceSchema).max(1000),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.resources.map((item) => item.sha256)).size !== manifest.resources.length)
      context.addIssue({
        code: 'custom',
        message: 'Scene resources must have one object per content identity',
      });
    if (manifest.resources.reduce((sum, item) => sum + item.byteLength, 0) > 64 << 20)
      context.addIssue({
        code: 'custom',
        message: 'Scene resources exceed their 64 MiB aggregate budget',
      });
  });
export type HyperframesSceneResources = z.infer<typeof hyperframesSceneResourcesSchema>;

/** Metadata admission only. Consumers also verify manifest and object bytes against their pins. */
export function assertHyperframesSceneResources(
  scene: HyperframesScene,
  ref: HyperframesSceneRef,
  manifest: HyperframesSceneResources,
  brandId: string,
): void {
  manifest = hyperframesSceneResourcesSchema.parse(manifest);
  const underBrand = (path: string) =>
    path.split('/')[0] === brandId &&
    /^[A-Za-z0-9_./-]+$/.test(path) &&
    path.split('/')[1] === 'native-ingest' &&
    path.split('/').length >= 4 &&
    !path.split('/').some((part) => part === '.' || part === '..');
  if (
    !ref.resources ||
    !underBrand(ref.storagePath) ||
    !underBrand(ref.resources.storagePath) ||
    manifest.sourceSha256 !== ref.sourceSha256 ||
    manifest.sceneSha256 !== ref.sha256 ||
    scene.source.upload?.sha256 !== ref.sourceSha256 ||
    scene.source.sha256 !== ref.entrySha256 ||
    scene.identity.compiler !== ref.compiler
  )
    throw Error('Native scene resource provenance differs from its frozen source');
  const dependencies = new Map<string, HyperframesScene['dependencies'][number]>();
  for (const dependency of scene.dependencies) {
    const previous = dependencies.get(dependency.sha256);
    if (
      previous &&
      (previous.byteLength !== dependency.byteLength ||
        previous.kind !== dependency.kind ||
        previous.mediaType !== dependency.mediaType)
    )
      throw Error('Native scene URL aliases have conflicting content metadata');
    dependencies.set(dependency.sha256, dependency);
  }
  if (dependencies.size !== manifest.resources.length)
    throw Error('Native scene resources are missing or unreferenced');
  for (const resource of manifest.resources) {
    const dependency = dependencies.get(resource.sha256);
    if (
      !dependency ||
      resource.byteLength !== dependency.byteLength ||
      resource.kind !== dependency.kind ||
      resource.mediaType !== dependency.mediaType ||
      !underBrand(resource.storagePath)
    )
      throw Error('Native scene resource does not match its immutable dependency');
  }
}
