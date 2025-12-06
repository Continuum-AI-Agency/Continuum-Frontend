import { NextResponse } from "next/server";
import { appendDocument, ensureOnboardingState } from "@/lib/onboarding/storage";
import type { OnboardingDocument } from "@/lib/onboarding/state";
import { createBrandId } from "@/lib/onboarding/state";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sanitizeStorageFileName } from "@/lib/storage/sanitize";

export const runtime = "nodejs";

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

  await ensureOnboardingState(brandId);

  const source = (formData.get("source") as OnboardingDocument["source"] | null) ?? "upload";

  const supabase = await createSupabaseServerClient();

  // Stable document id ties Storage, DB, and vector chunks together
  const documentId = createBrandId();
  const storageBucket = "brand-docs";
  const sanitizedFileName = sanitizeStorageFileName((file as File).name);
  const storagePath = `${brandId}/${documentId}/${sanitizedFileName}`;

  // Upload raw file to Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, file as File, { contentType: (file as File).type });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // Invoke Edge function asynchronously to extract/chunk/embed
  type EmbedInvokeResult = { jobId?: string };

  const { data: invokeData } = await supabase.functions.invoke<EmbedInvokeResult>("embed_document", {
    body: {
      brandId,
      documentId,
      source,
      storagePath: uploadData?.path ?? storagePath,
      fileName: sanitizedFileName,
      mimeType: (file as File).type,
    },
  });

  const document: OnboardingDocument = {
    id: documentId,
    name: (file as File).name,
    source,
    createdAt: new Date().toISOString(),
    status: "processing",
    size: (file as File).size,
    storagePath: uploadData?.path ?? storagePath,
    jobId: typeof invokeData?.jobId === "string" ? invokeData.jobId : undefined,
  };

  const state = await appendDocument(brandId, document);
  return NextResponse.json({ document, state });
}
