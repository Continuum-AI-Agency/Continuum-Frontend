import { notFound } from 'next/navigation';
import { z } from 'zod';
import { parseStudioVideoView } from '@/lib/ai-studio/studioVideoHref';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { VideoStudioWorkspace } from '@/StudioCanvas/nodes/timeline/VideoProductionWorkspaceDialog';

const projectIdSchema = z.string().uuid();
const originSchema = z.enum(['canvas', 'library']);

export default async function VideoStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ origin?: string; view?: string }>;
}) {
  const projectId = projectIdSchema.safeParse((await params).projectId);
  const query = await searchParams;
  const origin = originSchema.safeParse(query.origin);
  if (!projectId.success || !origin.success) notFound();
  const view = parseStudioVideoView(query.view);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .schema('media')
    .from('editor_projects')
    .select('brand_id')
    .eq('id', projectId.data)
    .maybeSingle();
  if (!data) notFound();

  return (
    <VideoStudioWorkspace
      projectId={projectId.data}
      brandId={data.brand_id}
      pool={[]}
      origin={origin.data}
      view={view}
    />
  );
}
