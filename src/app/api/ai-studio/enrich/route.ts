// Real document-enrichment route. Replaces the mock that only counted docs.
//
// Document extraction priority (per doc entry):
//   1. extractedText — caller already resolved text (rare; forwarded as-is)
//   2. sourceDocumentId — brand_profiles.brand_document_chunks.content concat
//      (pre-parsed on ingest via embed_document; covers all formats including PDF)
//   3. sourceUrl — fetch the signed storage URL → decode text (plain-text only)
//   4. content (base64 data URL) — last-resort fallback for legacy plain-text entries
//
// Local file uploads now go through /api/ai-studio/documents → embed_document,
// so they always arrive with a sourceDocumentId by the time they are used in a
// workflow. Path 2 is therefore the primary path for all locally-uploaded docs.
//
// Streaming: SSE with `text` delta events + `complete` event so
// useWorkflowExecution can stream the enriched prompt token-by-token.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Input schema (Zod at API boundary)
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  name: z.string(),
  type: z.enum(['pdf', 'txt']).default('txt'),
  extractedText: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  sourceDocumentId: z.string().uuid().optional(),
  content: z.string().optional(), // base64 data URL
});

const imageSchema = z.object({
  type: z.enum(['base64', 'url']),
  data: z.string().optional(),
  imageUrl: z.string().optional(),
  mimeType: z.string(),
  sourcePath: z.string().optional(),
  sourceUrl: z.string().optional(),
});

const audioSchema = z.object({
  type: z.literal('base64'),
  data: z.string(),
  mimeType: z.string(),
});

const videoSchema = z.object({
  type: z.enum(['base64', 'url']),
  data: z.string().optional(),
  imageUrl: z.string().optional(),
  mimeType: z.string(),
  sourcePath: z.string().optional(),
  sourceUrl: z.string().optional(),
});

const enrichBodySchema = z.object({
  prompt: z.string().default(''),
  brandId: z.string().optional(),
  context: z
    .object({
      images: z.array(imageSchema).optional(),
      audio: audioSchema.optional(),
      video: videoSchema.optional(),
      documents: z.array(documentSchema).optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Document text extraction helpers
// ---------------------------------------------------------------------------

function base64ToText(dataUrl: string): string | null {
  // dataUrl = "data:<mime>;base64,<b64>"
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return null;
  const b64 = dataUrl.slice(commaIdx + 1);
  try {
    return Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

async function fetchSignedUrlText(signedUrl: string): Promise<string | null> {
  try {
    const response = await fetch(signedUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) {
      console.warn(`[enrich] signed URL fetch returned ${response.status}: ${signedUrl.slice(0, 80)}`);
      return null;
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/pdf')) {
      // PDFs uploaded via the canvas reach this route with a sourceDocumentId
      // (embed_document has already extracted the text). A signed-URL PDF here
      // means a legacy entry without chunk data; skip it gracefully.
      console.info('[enrich] PDF at storage URL skipped — use sourceDocumentId path for PDF content');
      return null;
    }
    return await response.text();
  } catch (err) {
    console.warn('[enrich] fetchSignedUrlText failed', err);
    return null;
  }
}

async function fetchBrandDocumentChunks(
  documentId: string,
): Promise<string | null> {
  try {
    // Use admin client: chunk rows are server-side only (service role bypasses RLS).
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .schema('brand_profiles')
      .from('brand_document_chunks')
      .select('content, chunk_index')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    if (error) {
      console.warn('[enrich] brand_document_chunks fetch error', error.message);
      return null;
    }

    if (!data || data.length === 0) return null;

    return data.map((row) => (row as { content: string }).content).join('\n\n');
  } catch (err) {
    console.warn('[enrich] fetchBrandDocumentChunks failed', err);
    return null;
  }
}

async function extractDocumentText(
  doc: z.infer<typeof documentSchema>,
): Promise<string | null> {
  // Path 1: caller already has the text.
  if (doc.extractedText?.trim()) return doc.extractedText.trim();

  // Path 2: brand_document_chunks — best path for platform docs (covers PDFs).
  if (doc.sourceDocumentId) {
    const chunks = await fetchBrandDocumentChunks(doc.sourceDocumentId);
    if (chunks) return chunks;
  }

  // Path 3: fetch from signed storage URL.
  if (doc.sourceUrl) {
    const fetched = await fetchSignedUrlText(doc.sourceUrl);
    if (fetched) return fetched;
  }

  // Path 4: base64 data URL fallback (legacy plain-text entries only).
  // PDFs in this position have no pre-extracted text — skip gracefully. All
  // canvas uploads now go through embed_document and arrive with a sourceDocumentId.
  if (doc.content) {
    if (doc.type === 'pdf') {
      console.info(`[enrich] skipping PDF "${doc.name}" — no sourceDocumentId; upload through canvas to extract via embed_document`);
      return null;
    }
    return base64ToText(doc.content);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

async function assembleEnrichedPrompt(
  prompt: string,
  context: z.infer<typeof enrichBodySchema>['context'],
): Promise<string> {
  const parts: string[] = [];

  if (prompt.trim()) parts.push(prompt.trim());

  if (!context) return parts.join('\n\n') || prompt;

  // Images context note (image bytes go to the model separately; here we just
  // annotate the prompt so the LLM knows what's attached).
  if (context.images && context.images.length > 0) {
    parts.push(
      `[Visual context: ${context.images.length} reference image${context.images.length > 1 ? 's' : ''} attached]`,
    );
  }

  if (context.audio) {
    parts.push('[Audio context attached]');
  }

  if (context.video) {
    parts.push('[Video context attached]');
  }

  if (context.documents && context.documents.length > 0) {
    const textParts: string[] = [];
    for (const doc of context.documents) {
      const text = await extractDocumentText(doc);
      if (!text) {
        console.info(`[enrich] no extractable text for "${doc.name}"`);
        continue;
      }
      // Trim to avoid huge prompts; ~8 000 chars ≈ 2 000 tokens per doc.
      const trimmed = text.length > 8_000 ? text.slice(0, 8_000) + '\n[…truncated]' : text;
      textParts.push(`--- Document: ${doc.name} ---\n${trimmed}`);
    }
    if (textParts.length > 0) {
      parts.push('[Document context]\n' + textParts.join('\n\n'));
    }
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseChunk(event: string, data: string): string {
  return `event: ${event}\ndata: ${JSON.stringify({ delta: data })}\n\n`;
}

function sseComplete(): string {
  return `event: complete\ndata: {}\n\n`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = enrichBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request payload', issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { prompt, context } = parsed.data;

  const enrichedPrompt = await assembleEnrichedPrompt(prompt, context);

  // Stream the result as SSE so the client can display it incrementally.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send in chunks of ~80 chars to simulate streaming while keeping it simple.
      // In a future iteration this would stream from an LLM call.
      const chunkSize = 80;
      for (let i = 0; i < enrichedPrompt.length; i += chunkSize) {
        const delta = enrichedPrompt.slice(i, i + chunkSize);
        controller.enqueue(encoder.encode(sseChunk('delta', delta)));
      }
      controller.enqueue(encoder.encode(sseComplete()));
      controller.close();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
