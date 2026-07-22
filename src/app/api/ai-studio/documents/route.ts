// POST /api/ai-studio/documents
//
// Accepts document upload metadata after the browser has uploaded the file
// directly to Supabase Storage (bucket: brand-docs), then invokes the
// embed_document edge function to extract text (PDF via Gemini OCR), chunk,
// and embed the content into brand_document_chunks.
//
// Mirrors src/app/api/onboarding/documents/route.ts but deliberately omits the
// ensureOnboardingState / appendDocument side effects, which would corrupt
// onboarding state for already-onboarded brands. The brand_documents row itself
// is written by the edge function's upsert.

import { NextResponse } from 'next/server';
import { validateDocumentUploadMetadata } from '@/lib/documents/uploadLimits';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const STORAGE_BUCKET = 'brand-docs';

type RequestBody = {
  brandId?: unknown;
  documentId?: unknown;
  storagePath?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  source?: unknown;
  category?: unknown;
};

async function storageObjectExists(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  storagePath: string,
): Promise<boolean> {
  const lastSlash = storagePath.lastIndexOf('/');
  const folder = storagePath.slice(0, lastSlash);
  const name = storagePath.slice(lastSlash + 1);
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(folder, { search: name, limit: 100 });
  if (error) return false;
  return (data ?? []).some((entry) => entry.name === name);
}

type EmbedInvokeResult = { jobId?: string };

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const metadata = {
    brandId: typeof body.brandId === 'string' ? body.brandId : undefined,
    documentId: typeof body.documentId === 'string' ? body.documentId : undefined,
    storagePath: typeof body.storagePath === 'string' ? body.storagePath : undefined,
    fileName: typeof body.fileName === 'string' ? body.fileName : undefined,
    mimeType: typeof body.mimeType === 'string' ? body.mimeType : '',
    size: typeof body.size === 'number' ? body.size : undefined,
  };

  const validation = validateDocumentUploadMetadata(metadata);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const brandId = metadata.brandId as string;
  const documentId = metadata.documentId as string;
  const storagePath = metadata.storagePath as string;
  const fileName = metadata.fileName ?? storagePath.slice(storagePath.lastIndexOf('/') + 1);
  const mimeType = metadata.mimeType;
  const size = metadata.size as number;
  const source = typeof body.source === 'string' ? body.source : 'upload';
  const category = typeof body.category === 'string' ? body.category : 'misc';

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: brandRow } = await supabase
    .schema('brand_profiles')
    .from('brand_profiles')
    .select('id')
    .eq('id', brandId)
    .maybeSingle();
  if (!brandRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!(await storageObjectExists(supabase, storagePath))) {
    return NextResponse.json({ error: 'Uploaded file not found in storage' }, { status: 422 });
  }

  const { data: invokeData } = await supabase.functions.invoke<EmbedInvokeResult>(
    'embed_document',
    {
      body: {
        brandId,
        documentId,
        source,
        category,
        storagePath,
        fileName,
        mimeType,
      },
    },
  );

  return NextResponse.json({
    documentId,
    name: fileName,
    status: 'processing',
    storagePath,
    mimeType,
    size,
    jobId: typeof invokeData?.jobId === 'string' ? invokeData.jobId : undefined,
  });
}
