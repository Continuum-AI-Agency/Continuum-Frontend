import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const STORAGE_KEY_PREFIX = "continuum:hf-mp4:";

// Session-level guard so the background render fires at most once per composition
// per tab; the edge function's renders table is the authoritative idempotency gate.
const inFlight = new Set<string>();

function storageKey(compositionId: string): string {
  return `${STORAGE_KEY_PREFIX}${compositionId}`;
}

function alreadyKickedOff(compositionId: string): boolean {
  if (inFlight.has(compositionId)) return true;
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(storageKey(compositionId)) === "1";
  } catch {
    return false;
  }
}

function markKickedOff(compositionId: string): void {
  inFlight.add(compositionId);
  try {
    window.localStorage.setItem(storageKey(compositionId), "1");
  } catch {
    // localStorage may be unavailable (private mode); the in-memory guard still holds.
  }
}

function clearKickedOff(compositionId: string): void {
  inFlight.delete(compositionId);
  try {
    window.localStorage.removeItem(storageKey(compositionId));
  } catch {
    // ignore
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export type PersistHyperframeMp4Params = {
  compositionId: string;
  brandId: string;
  draftId: string | null;
  durationSec: number;
  /** Renders the composition HTML to an MP4 blob (mediabunny). */
  renderMp4: () => Promise<Blob>;
};

/**
 * On first view of a hyperframe, render its HTML composition to an MP4 and
 * persist+link it via the `link-hyperframe-mp4` edge function. Fire-and-forget,
 * once per composition — a failure must never block the live preview.
 */
export async function persistHyperframeMp4OnFirstRender(params: PersistHyperframeMp4Params): Promise<void> {
  const { compositionId } = params;
  if (!compositionId || alreadyKickedOff(compositionId)) return;
  markKickedOff(compositionId);

  try {
    const blob = await params.renderMp4();
    const mp4Base64 = await blobToBase64(blob);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.functions.invoke("link-hyperframe-mp4", {
      body: {
        compositionId,
        brandId: params.brandId,
        draftId: params.draftId,
        mp4Base64,
        mimeType: "video/mp4",
        durationSec: params.durationSec,
      },
    });
    if (error) throw error;
  } catch (err) {
    // Allow a later retry if this attempt failed.
    clearKickedOff(compositionId);
    console.warn("[hyperframe-mp4] background persist failed", err);
  }
}
