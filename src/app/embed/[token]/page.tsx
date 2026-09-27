import { compositionSpecSchema, type MediaAsset } from '@continuum/contracts';
import type { Metadata } from 'next';
import { z } from 'zod';
import { loadSharePayload } from '@/app/share/[token]/loadSharePayload';
import { HyperframesInteractivePlayer } from '@/lib/hyperframes-agent/InteractivePreview';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const metadata: Metadata = {
  title: 'Video — Continuum',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

const versionSchema = z.object({
  id: z.string(),
  asset_id: z.string(),
  bucket: z.string(),
  storage_path: z.string(),
});

async function loadInteractive(asset: MediaAsset) {
  const origin = asset.originRef;
  if (
    origin?.kind !== 'hyperframes_agent' ||
    typeof origin.revisionId !== 'string' ||
    typeof origin.runId !== 'string'
  )
    return null;
  const admin = createSupabaseAdminClient();
  const { data: revision } = await admin
    .schema('brand_profiles')
    .from('ai_studio_hyperframe_revisions')
    .select(
      'id,run_id,session_id,composition_bucket,composition_path,composition_spec,width,height,aspect_ratio',
    )
    .eq('id', origin.revisionId)
    .eq('run_id', origin.runId)
    .maybeSingle();
  if (!revision) return null;
  const { data: session } = await admin
    .schema('brand_profiles')
    .from('ai_studio_hyperframe_sessions')
    .select('id')
    .eq('id', revision.session_id)
    .eq('brand_id', asset.brandId)
    .maybeSingle();
  if (!session) return null;
  const parsed = compositionSpecSchema.safeParse(revision.composition_spec);
  if (!parsed.success) return null;
  const pins = [
    ...parsed.data.scenes.flatMap((scene) => (scene.asset ? [scene.asset] : [])),
    ...(parsed.data.background_audio ? [parsed.data.background_audio] : []),
  ];
  const versionIds = [...new Set(pins.map((pin) => pin.assetVersionId))];
  const { data: rows, error: versionError } = versionIds.length
    ? await mediaSchema(admin)
        .from('asset_versions')
        .select('id,asset_id,bucket,storage_path')
        .eq('brand_id', asset.brandId)
        .in('id', versionIds)
    : { data: [], error: null };
  if (versionError) return null;
  const parsedVersions = z.array(versionSchema).safeParse(rows ?? []);
  if (!parsedVersions.success) return null;
  const versions = parsedVersions.data;
  const byVersion = new Map(versions.map((version) => [version.id, version]));
  const urls = await Promise.all(
    pins.map(async (pin) => {
      const version = byVersion.get(pin.assetVersionId);
      if (!version || version.asset_id !== pin.assetId) return null;
      const { data, error } = await admin.storage
        .from(version.bucket)
        .createSignedUrl(version.storage_path, 3600);
      return error || !data?.signedUrl ? null : { assetId: pin.assetId, url: data.signedUrl };
    }),
  );
  if (urls.some((item) => !item)) return null;
  const { data: blob, error: downloadError } = await admin.storage
    .from(revision.composition_bucket)
    .download(revision.composition_path);
  if (downloadError || !blob) return null;
  let html = await blob.text();
  for (const item of urls) if (item) html = html.replaceAll(`hf-asset://${item.assetId}`, item.url);
  if (html.includes('hf-asset://')) return null;
  return {
    html,
    width: revision.width,
    height: revision.height,
    aspectRatio: revision.aspect_ratio,
  };
}

export default async function VideoEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { token } = await params;
  const { mode } = await searchParams;
  const result = await loadSharePayload(token);
  const asset =
    result.ok && result.payload.scope === 'asset' && result.payload.assets.length === 1
      ? result.payload.assets[0]?.asset
      : null;
  if (!asset || asset.kind !== 'video' || !asset.signedUrl) {
    return (
      <main className="grid min-h-screen place-items-center bg-black p-4 text-sm text-white">
        Video unavailable
      </main>
    );
  }
  if (mode === 'interactive') {
    const composition = await loadInteractive(asset);
    if (!composition)
      return (
        <main className="grid min-h-screen place-items-center bg-black p-4 text-sm text-white">
          Composition unavailable
        </main>
      );
    return (
      <main className="min-h-screen bg-black">
        <HyperframesInteractivePlayer {...composition} />
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-black">
      <video
        src={asset.signedUrl}
        controls
        playsInline
        preload="metadata"
        className="h-screen w-screen object-contain"
      >
        <track kind="captions" />
      </video>
    </main>
  );
}
