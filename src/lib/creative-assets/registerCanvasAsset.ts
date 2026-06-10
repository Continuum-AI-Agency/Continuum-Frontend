import type { RegisterCanvasAssetRequest } from "@continuum/contracts";

// Fire-and-forget registration of a canvas creation into the media library.
// Swallows errors: a failed registration must never disrupt the generation
// flow. Returns the new (or existing) media.assets id, or null.
export async function registerCanvasOutput(
  input: RegisterCanvasAssetRequest,
): Promise<string | null> {
  try {
    const resp = await fetch("/api/library/register-canvas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as { assetId?: string | null };
    return data.assetId ?? null;
  } catch (err) {
    console.warn("[registerCanvasOutput] failed", err);
    return null;
  }
}
