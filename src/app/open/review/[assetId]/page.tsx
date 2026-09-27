import type { SupabaseClient } from '@supabase/supabase-js';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EditorView } from '@/components/library/review/EditorView';
import { callerHasBrandAccess } from '@/lib/media/brand-access.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// The editor view: a compact, chrome-free comment list to keep in a narrow window
// beside Premiere, Resolve or Final Cut — SMPTE timecodes to type into the
// timeline, resolve boxes, and one-click marker export. /open/* is session-guarded
// by the proxy; brand access is checked here before anything renders.

// Reads the brand from the query string at request time.
export const instant = false;

export const metadata: Metadata = { title: 'Editor view | Continuum AI' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export default async function EditorViewPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ brandId?: string | string[]; versionId?: string | string[] }>;
}) {
  const { assetId } = await params;
  const query = await searchParams;
  const brandId = first(query.brandId);
  const versionId = first(query.versionId) || null;
  if (!UUID.test(assetId) || !UUID.test(brandId) || (versionId && !UUID.test(versionId))) {
    notFound();
  }
  const supabase = await createSupabaseServerClient();
  if (!(await callerHasBrandAccess(supabase as unknown as SupabaseClient, brandId))) notFound();
  return <EditorView brandId={brandId} assetId={assetId} versionId={versionId} />;
}
