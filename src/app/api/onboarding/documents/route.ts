import { toDocumentCategory } from '@continuum/contracts';
import { NextResponse } from 'next/server';
import { validateDocumentUploadMetadata } from '@/lib/documents/uploadLimits';
import type { OnboardingDocument } from '@/lib/onboarding/state';
import { appendDocument, ensureOnboardingState } from '@/lib/onboarding/storage';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// The file itself is uploaded browser -> Supabase Storage directly (see
// useDocumentMutations) to bypass the 4.5 MB Vercel Function request-body cap.
// This route only receives the resulting object's metadata, then records the
// document and kicks off the embed pipeline. The size/type gate lives on the
// brand-docs bucket (file_size_limit) plus the validation below.

const STORAGE_BUCKET = 'brand-docs';

type UploadRequestBody = {
  brandId?: unknown;
  documentId?: unknown;
  storagePath?: unknown;
  fileName?: unknown;
  displayName?: unknown;
  mimeType?: unknown;
  size?: unknown;
  source?: unknown;
  category?: unknown;
};

async function objectExists(
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

export async function POST(request: Request) {
  let body: UploadRequestBody;
  try {
    body = (await request.json()) as UploadRequestBody;
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
  const displayName =
    typeof body.displayName === 'string' && body.displayName.trim() ? body.displayName : fileName;
  const mimeType = metadata.mimeType;
  const size = metadata.size as number;
  const source = (
    typeof body.source === 'string' ? body.source : 'upload'
  ) as OnboardingDocument['source'];
  const category = toDocumentCategory(body.category);

  const supabase = await createSupabaseServerClient();

  // Authenticated caller required; brand membership enforced via RLS (returns
  // nothing if the user is not a member of the brand).
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

  // Confirm the client actually uploaded the object before recording it, so we
  // never persist a document row that points at nothing.
  if (!(await objectExists(supabase, storagePath))) {
    return NextResponse.json({ error: 'Uploaded file not found in storage' }, { status: 422 });
  }

  await ensureOnboardingState(brandId);

  type EmbedInvokeResult = { jobId?: string };
  const { data: invokeData, error: invokeError } =
    await supabase.functions.invoke<EmbedInvokeResult>('embed_document', {
      body: {
        brandId,
        documentId,
        source,
        category,
        storagePath,
        fileName,
        mimeType,
      },
    });

  // If processing never even started, record the document as failed instead of
  // leaving it "processing" forever — the row only ever advances to a terminal
  // state via the edge function's progress writes, so a failed kickoff would
  // otherwise hang the UI on "Extracting text" with no end state.
  const invokeFailed = Boolean(invokeError);
  if (invokeFailed) {
    console.error('embed_document invoke failed', invokeError);
  }

  const document: OnboardingDocument = {
    id: documentId,
    name: displayName,
    source,
    category,
    createdAt: new Date().toISOString(),
    status: invokeFailed ? 'error' : 'processing',
    progressStep: invokeFailed ? 'error' : 'uploading',
    progressPercent: 100,
    size,
    mimeType,
    storagePath,
    jobId: typeof invokeData?.jobId === 'string' ? invokeData.jobId : undefined,
    ...(invokeFailed
      ? {
          errorCode: 'INTERNAL_ERROR' as const,
          errorMessage: invokeError?.message ?? 'Could not start document processing.',
        }
      : {}),
  };

  const state = await appendDocument(brandId, document);
  return NextResponse.json({ document, state });
}
