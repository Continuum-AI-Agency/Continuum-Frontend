import { NextResponse } from "next/server";
import { appendDocument } from "@/lib/onboarding/storage";
import type { OnboardingDocument } from "@/lib/onboarding/state";
import { createBrandId } from "@/lib/onboarding/state";

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

  const source = (formData.get("source") as OnboardingDocument["source"] | null) ?? "upload";

  const document: OnboardingDocument = {
    id: createBrandId(),
    name: file.name,
    source,
    createdAt: new Date().toISOString(),
    status: "processing",
    size: file.size,
  };

  // TODO: Invoke embedder edge function with `file` to generate embeddings.
  // For now, immediately mark the document as ready to unblock onboarding.
  document.status = "ready";

  const state = await appendDocument(brandId, document);
  return NextResponse.json({ document, state });
}
