import { NextResponse } from "next/server";
import { toDocumentCategory } from "@continuum/contracts";
import { appendDocument, ensureOnboardingState } from "@/lib/onboarding/storage";
import type { OnboardingDocument } from "@/lib/onboarding/state";
import { createBrandId } from "@/lib/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeStorageFileName } from "@/lib/storage/sanitize";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ACCEPTED_MIME_PREFIXES = ["text/", "image/"];
const ACCEPTED_MIME_EXACT = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/json",
  "",
]);

function isAcceptedMime(mime: string): boolean {
  if (ACCEPTED_MIME_EXACT.has(mime)) return true;
  return ACCEPTED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const brandId = formData.get("brandId");
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (!brandId || typeof brandId !== "string") {
    return NextResponse.json({ error: "Missing brand context" }, { status: 400 });
  }

  const incoming = file as File;
  if (incoming.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `File exceeds ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB limit` },
      { status: 413 },
    );
  }
  if (!isAcceptedMime(incoming.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${incoming.type || "unknown"}` },
      { status: 415 },
    );
  }

  await ensureOnboardingState(brandId);

  const source = (formData.get("source") as OnboardingDocument["source"] | null) ?? "upload";
  const category = toDocumentCategory(formData.get("category"));

  const supabase = await createSupabaseServerClient();

  const documentId = createBrandId();
  const storageBucket = "brand-docs";
  const sanitizedFileName = sanitizeStorageFileName(incoming.name);
  const storagePath = `${brandId}/${documentId}/${sanitizedFileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, incoming, { contentType: incoming.type });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const finalStoragePath = uploadData?.path ?? storagePath;

  type EmbedInvokeResult = { jobId?: string };

  const { data: invokeData } = await supabase.functions.invoke<EmbedInvokeResult>("embed_document", {
    body: {
      brandId,
      documentId,
      source,
      category,
      storagePath: finalStoragePath,
      fileName: sanitizedFileName,
      mimeType: incoming.type,
    },
  });

  const document: OnboardingDocument = {
    id: documentId,
    name: incoming.name,
    source,
    category,
    createdAt: new Date().toISOString(),
    status: "processing",
    progressStep: "uploading",
    progressPercent: 100,
    size: incoming.size,
    mimeType: incoming.type,
    storagePath: finalStoragePath,
    jobId: typeof invokeData?.jobId === "string" ? invokeData.jobId : undefined,
  };

  const state = await appendDocument(brandId, document);
  return NextResponse.json({ document, state });
}
