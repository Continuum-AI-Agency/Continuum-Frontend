import { NextResponse } from 'next/server';
import {
  type RecordDocumentUploadBody,
  recordDocumentUpload,
} from '@/lib/documents/recordDocumentUpload';

export const runtime = 'nodejs';

// The single brand-document metadata endpoint. Replaces /api/onboarding/documents and
// /api/ai-studio/documents, which were near-identical copies that had already drifted
// (only one honored displayName; only one coerced the category).
//
// The file itself never passes through here — the browser uploads straight to Supabase
// Storage to bypass the 4.5 MB Vercel Function body cap, and this route records the
// resulting object. See src/lib/documents/uploadBrandDocument.ts for the client half.

export async function POST(request: Request) {
  let body: RecordDocumentUploadBody;
  try {
    body = (await request.json()) as RecordDocumentUploadBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await recordDocumentUpload(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ document: result.document, state: result.state });
}
